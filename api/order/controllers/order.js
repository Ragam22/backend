"use strict";

const onOrderComplete = async ({ user, entity, refCode }) => {
  for (const e of entity) {
    if (e.type === "event" || e.type === "workshop" || e.type === "lecture") {
      await strapi
        .query(e.type)
        .model.query((qb) => {
          qb.where("id", e.id);
          qb.increment("currentRegCount", 1);
        })
        .fetch();
    }
    switch (e.type) {
      case "workshop":
        const workshopDetail = {
          workshop: { id: e.id },
          user: user,
          workshopRefCode: refCode,
        };
        await strapi.services["user-workshop-details"].create(workshopDetail);
        break;
      case "lecture":
        const lectureDetail = {
          lecture: { id: e.id },
          user: user,
          lectureRefCode: refCode,
        };
        await strapi.services["user-lecture-detail"].create(lectureDetail);
        break;
      case "ragamReg":
        await strapi.query("user", "users-permissions").update({ id: user.id }, { isRagamReg: true });
        break;
      case "hospitality":
        await strapi
          .query("user", "users-permissions")
          .update({ id: user.id }, { gender: e.sex, hostelChoice: e.choice });
        break;
      case "event":
        const eventDetail = {
          event: e.id,
          teamMembers: e.team,
          eventRefCode: refCode,
          status: "participating",
        };
        await strapi.services["user-event-detail"].create(eventDetail);
        break;
    }
  }
};

module.exports = {
  async startPayment(ctx) {
    const { nanoid } = require("nanoid");
    const axios = require("axios");

    const { refCode, events } = ctx.request.body;

    const user = await strapi.query("user", "users-permissions").findOne({ id: ctx.state.user.id });

    let orderAmount = 0;
    let orderBreakdown = {};

    //id of event, workshop or lecture else null
    let entity = null;

    for (const e of events) {
      switch (e.type) {
        case "ragamReg": {
          if (user.isRagamReg) {
            return ctx.badRequest("User has already registered for ragam.");
          }
          let regAmount = (await strapi.query("ragam-reg-amount").find())[0].regAmount;

          //if registered for choreonite
          if (user.registeredEvents.find(({ event }) => event == process.env.CHOREONITE_EV_ID)) {
            const choreoRegAmount = (
              await strapi.services.event.findOne({
                id: Number.parseInt(process.env.CHOREONITE_EV_ID),
              })
            ).regPrice;
            regAmount -= choreoRegAmount;
          }

          //if registered for fashion show
          if (user.registeredEvents.find(({ event }) => event == process.env.FASHION_EV_ID)) {
            const fashionRegAmount = (
              await strapi.services.event.findOne({
                id: Number.parseInt(process.env.FASHION_EV_ID),
              })
            ).regPrice;
            regAmount -= fashionRegAmount;
          }

          if (regAmount < 0) regAmount = 0;

          orderAmount += regAmount;
          orderBreakdown.ragamReg = regAmount;
          break;
        }

        case "hospitality": {
          if (user.hostelChoice !== "none") {
            return ctx.badRequest("User has already completed hospitality reg");
          }

          if (e.sex === "female" && e.choice === "individual") {
            return ctx.badRequest("Girls dont get rooms smh");
          }

          const hospAmount = (await strapi.query("ragam-reg-amount").find())[0][`${e.choice}RoomAmount`];

          orderAmount += hospAmount;
          orderBreakdown.hospitality = hospAmount;
          break;
        }

        case "event": {
          const eventId = e.id;
          if (entity) {
            return ctx.badRequest("send only one event");
          } else {
            entity = e;
          }

          const ragamRegAmount = (await strapi.query("ragam-reg-amount").find())[0].regAmount;
          let regAmount;

          if (eventId == process.env.CHOREONITE_EV_ID) {
            const choreoRegAmount = (
              await strapi.services.event.findOne({
                id: Number.parseInt(process.env.CHOREONITE_EV_ID),
              })
            ).regPrice;
            regAmount = choreoRegAmount;
          } else if (eventId == process.env.FASHION_EV_ID) {
            const fashionRegAmount = (
              await strapi.services.event.findOne({
                id: Number.parseInt(process.env.FASHION_EV_ID),
              })
            ).regPrice;
            regAmount = fashionRegAmount;
          } else {
            regAmount = ragamRegAmount;
          }

          if ((e.team?.length || 0) + 1 > (await strapi.services.event.findOne({ id: eventId }).maxTeamSize))
            return ctx.badRequest("Too big");

          const teamMembers = [];
          for (const rId of [user.ragamId, ...(e.team || [])]) {
            const u = await strapi.query("user", "users-permissions").findOne({ ragamId: rId });
            if (!u) return ctx.badRequest("Invalid ID");
            if (u.registeredEvents.find((o) => o.event === eventId)) {
              return ctx.badRequest(`RagamID ${rId} has already joined a team`);
            }

            let uAmount = u.isRagamReg ? regAmount - ragamRegAmount : regAmount;
            if (uAmount < 0) uAmount = 0;
            orderAmount += uAmount;
            orderBreakdown["event." + rId] = uAmount;
            teamMembers.push({ id: u.id });
          }

          e.team = teamMembers;

          break;
        }

        case "workshop": {
          const workshopAmount = await strapi.services.workshop.findOne({ id: e.id }).regPrice;
          orderAmount += workshopAmount;
          orderBreakdown.workshopReg = workshopAmount;

          if (entity) {
            return ctx.badRequest("send only one event");
          } else {
            entity = e;
          }
          break;
        }

        case "lecture": {
          const lectureAmount = await strapi.services.lecture.findOne({ id: e.id }).regPrice;
          orderAmount += lectureAmount;
          orderBreakdown.lectureReg = lectureAmount;

          if (entity) {
            return ctx.badRequest("send only one event");
          } else {
            entity = e;
          }
          break;
        }

        default:
          return ctx.badRequest("invalid payment type");
      }
    }

    if (entity !== null) {
      const found = await strapi.services[entity.type].findOne({ id: entity.id });
      if (found.currentRegCount >= found.maxRegCount) return ctx.badRequest("Max capacity has been reached");

      let existing = await strapi.services.order.findOne({
        "user.id": user.id,
        entity: JSON.stringify(events),
      });

      if (existing !== null) return { orderId: existing.orderId };
    }

    orderAmount = Math.floor(orderAmount * 100);

    if (orderAmount == 0) {
      await onOrderComplete({ user, entity: events });
      return {
        orderId: null,
      };
    }

    const razorpayBody = {
      amount: orderAmount,
      currency: "INR",
      receipt: nanoid(),
    };

    const razorAuth = {
      username: process.env.RAZORPAY_USERNAME,
      password: process.env.RAZORPAY_PASSWORD,
    };

    try {
      const response = await axios.post("https://api.razorpay.com/v1/orders", razorpayBody, { auth: razorAuth });

      // const response = {
      //   data: { id: nanoid(), receipt: nanoid() },
      // };

      let orderObj = {
        user: { id: user.id },
        refCode: refCode,
        isPaymentComplete: false,
        orderId: response.data.id,
        receipt: response.data.receipt,
        entity: events,
      };

      await strapi.services.order.create(orderObj);
      return { orderId: response.data.id, orderBreakdown };
    } catch (error) {
      return ctx.badRequest("Payment Failed");
    }
  },

  async onPaymentComplete(ctx) {
    const crypto = require("crypto");
    const shasum = crypto.createHmac("sha256", process.env.RAZORPAY_SECRET);
    shasum.update(JSON.stringify(ctx.request.body));
    const digest = shasum.digest("hex");

    if (digest !== ctx.request.headers["x-razorpay-signature"]) {
      return ctx.unauthorized("Lies");
    }

    let orderObj = await strapi.services.order.findOne({
      orderId: ctx.request.body.payload.payment.entity["order_id"],
    });
    await strapi.services.order.update({ id: orderObj.id }, { isPaymentComplete: true });

    await onOrderComplete(orderObj);

    return { status: "ok" };
  },
};
