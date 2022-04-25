"use strict";

const onOrderComplete = async ({ user, entity, refCode, breakdown }) => {
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
      case "kalolsavReg":
        await strapi.query("user", "users-permissions").update({ id: user.id }, { isKalolsavReg: true });
        break;
      case "hospitality":
        await strapi
          .query("user", "users-permissions")
          .update({ id: user.id }, { gender: e.sex, hostelChoice: e.choice, hostelDays: e.days });

        const sChar = e.sex[0].toUpperCase();
        for (const dayS of e.days) {
          await strapi
            .query("room-counts")
            .model.query((qb) => {
              qb.where("id", 1);
              qb.decrement(`${e.choice}${dayS}${sChar}`, 1);
            })
            .fetch();
        }
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

    for (const [k, v] of Object.entries(breakdown)) {
      if (k == "ragamReg" || k == "kalolsavReg") {
        await strapi
          .query("user", "users-permissions")
          .model.query((qb) => {
            qb.where("id", user.id);
            qb.increment("amountPaid", v);
          })
          .fetch();
      } else if (k.startsWith("event")) {
        await strapi
          .query("user", "users-permissions")
          .model.query((qb) => {
            qb.where("ragamId", k.substring(6));
            qb.increment("amountPaid", v);
          })
          .fetch();
      }
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

    //amount being paid for ragam and kalolsav reg in same request
    let auxAmount = 0;

    for (const e of events) {
      switch (e.type) {
        case "ragamReg":
        case "kalolsavReg": {
          const [field, mainPay] = {
            ragamReg: ["isRagamReg", "regAmount"],
            kalolsavReg: ["isKalolsavReg", "kalolsavRegAmount"],
          }[e.type];

          if (user[field]) {
            return ctx.badRequest("User has already completed " + e.type);
          }
          const regAmounts = (await strapi.query("ragam-reg-amount").find())[0];
          let regAmount = regAmounts[mainPay] - user.amountPaid - auxAmount;

          if (regAmount < 0) regAmount = 0;

          orderAmount += regAmount;
          auxAmount += regAmount;

          orderBreakdown[e.type] = regAmount;
          break;
        }

        case "hospitality": {
          if (user.hostelChoice !== "none") {
            return ctx.badRequest("User has already completed hospitality reg");
          }

          if (e.sex === "female" && e.choice !== "common") {
            return ctx.badRequest("Girls dont get rooms smh");
          }

          const regAmounts = (await strapi.query("ragam-reg-amount").find())[0];
          const hospAmounts = [regAmounts[`${e.choice}RoomAmount`], regAmounts[`${e.choice}RoomAmountx2`]];
          const roomCounts = (await strapi.query("room-counts").find())[0];
          const sChar = e.sex[0].toUpperCase();
          let cashMoney = 0;
          for (const [i, dayS] of e.days.entries()) {
            if (roomCounts[`${e.choice}${dayS}${sChar}`] <= 0)
              return ctx.badRequest("There are no rooms available on " + dayS);
            cashMoney += hospAmounts[i];
          }

          orderAmount += cashMoney;
          orderBreakdown.hospitality = cashMoney;
          break;
        }

        case "event": {
          const eventId = e.id;
          if (entity) {
            return ctx.badRequest("send only one event");
          } else {
            entity = e;
          }

          const regAmounts = (await strapi.query("ragam-reg-amount").find())[0];
          const ragamRegAmount = regAmounts.regAmount;
          const kalolsavRegAmount = regAmounts.kalolsavRegAmount;

          const eventObj = await strapi.services.event.findOne({ id: eventId });

          let regAmount = { payment: eventObj.regPrice, ragamReg: ragamRegAmount, kalolsavReg: kalolsavRegAmount }[
            eventObj.regType
          ];

          const teamSize = (e.team?.length || 0) + 1;
          if (teamSize > eventObj.maxTeamSize || teamSize < eventObj.minTeamSize)
            return ctx.badRequest("Team size does not fit");

          let currentDate = new Date();
          if (!(new Date(eventObj.regStartDate) < currentDate && currentDate < new Date(eventObj.regEndDate)))
            return ctx.badRequest("Not in registration period");

          const isSports = eventObj.category === "Sports";

          const teamMembers = [];
          for (const rId of [user.ragamId, ...(e.team || [])]) {
            const u = await strapi.query("user", "users-permissions").findOne({ ragamId: rId });
            if (!u) return ctx.badRequest("Invalid ID");
            if (u.registeredEvents.find((o) => o.event === eventId)) {
              return ctx.badRequest(`RagamID ${rId} has already joined a team`);
            }

            if (!isSports) {
              //for the requesting user, subtract any auxiliary amount that's already been counted

              let uAmount = regAmount - u.amountPaid - (rId == user.ragamId ? auxAmount : 0);

              if (uAmount < 0) uAmount = 0;
              orderAmount += uAmount;
              orderBreakdown["event." + rId] = uAmount;
            }
            if (teamMembers.find((o) => o.id === u.id)) return ctx.badRequest("repeat users found");
            teamMembers.push({ id: u.id });
          }

          //add the amount paid for this event to the auxiliary amount
          auxAmount += orderBreakdown["event." + user.ragamId];

          if (isSports) {
            orderBreakdown["sports"] = regAmount;
            orderAmount += regAmount;
          }
          e.team = teamMembers;

          break;
        }

        case "workshop": {
          const workshopAmount = (await strapi.services.workshop.findOne({ id: e.id })).regPrice;
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
          const lectureAmount = (await strapi.services.lecture.findOne({ id: e.id })).regPrice;
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

      // let existing = await strapi.services.order.findOne({
      //   "user.id": user.id,
      //   entity: JSON.stringify(events),
      // });

      // if (existing !== null) return { orderId: existing.orderId };
    }

    orderAmount = Math.floor(orderAmount * 100);

    if (orderAmount == 0) {
      await onOrderComplete({ user, entity: events, breakdown: orderBreakdown });
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
        breakdown: orderBreakdown,
      };

      // onOrderComplete(orderObj);
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
