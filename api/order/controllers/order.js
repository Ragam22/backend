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
        await strapi
          .query("reg-counts")
          .model.query((qb) => {
            qb.where("id", 1);
            qb.increment(`ragamRegCount`, 1);
          })
          .fetch();
        break;
      case "kalolsavReg":
        await strapi.query("user", "users-permissions").update({ id: user.id }, { isKalolsavReg: true });
        await strapi
          .query("reg-counts")
          .model.query((qb) => {
            qb.where("id", 1);
            qb.increment(`kalolsavRegCount`, 1);
          })
          .fetch();
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
};

const getOrderDetails = async ({ user: userQ, events }) => {
  const user = await strapi.query("user", "users-permissions").findOne(userQ);

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
          throw "User has already completed " + e.type;
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
          throw "User has already completed hospitality reg";
        }

        // if (e.sex === "female" && e.choice !== "common") {
        //   throw "Girls dont get rooms smh";
        // }

        if (e.days.filter((x) => x !== "Sat" && x !== "Sun").length) throw "invalid days param";

        const regAmounts = (await strapi.query("ragam-reg-amount").find())[0];
        const hospAmounts = [regAmounts[`${e.choice}RoomAmount`], regAmounts[`${e.choice}RoomAmountx2`]];
        const roomCounts = (await strapi.query("room-counts").find())[0];
        const sChar = e.sex[0].toUpperCase();
        let cashMoney = 0;
        for (const [i, dayS] of e.days.entries()) {
          if (roomCounts[`${e.choice}${dayS}${sChar}`] <= 0) throw "There are no rooms available on " + dayS;
          cashMoney += hospAmounts[i];
        }

        orderAmount += cashMoney;
        orderBreakdown.hospitality = cashMoney;
        break;
      }

      case "event": {
        const eventId = e.id;
        if (entity) {
          throw "send only one event";
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
        if (teamSize > eventObj.maxTeamSize || teamSize < eventObj.minTeamSize) throw "Team size does not fit";

        let currentDate = new Date();
        if (!(new Date(eventObj.regStartDate) < currentDate && currentDate < new Date(eventObj.regEndDate)))
          throw "Not in registration period";

        const isSports = eventObj.category === "Sports";
        const isQuiz = eventObj.name?.toLowerCase()?.includes("quiz");

        const teamMembers = [];
        for (const rId of [user.ragamId, ...(e.team || [])]) {
          const u = await strapi.query("user", "users-permissions").findOne({ ragamId: rId.trim() });
          if (!u) throw "Invalid ID: " + rId;
          if (u.registeredEvents.find((o) => o.event === eventId)) {
            throw `RagamID ${rId} has already joined a team`;
          }

          if (!isSports && !isQuiz) {
            //for the requesting user, subtract any auxiliary amount that's already been counted

            let uAmount = regAmount - u.amountPaid - (rId == user.ragamId ? auxAmount : 0);

            if (uAmount < 0) uAmount = 0;
            orderAmount += uAmount;
            orderBreakdown["event." + rId] = uAmount;
          }
          if (teamMembers.find((o) => o.id === u.id)) throw "repeat users found";
          teamMembers.push({ id: u.id });
        }

        //add the amount paid for this event to the auxiliary amount
        auxAmount += orderBreakdown["event." + user.ragamId];

        if (isSports) {
          orderBreakdown["sports"] = regAmount;
          orderAmount += regAmount;
        } else if (isQuiz) {
          orderBreakdown["quiz"] = regAmount;
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
          throw "send only one event";
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
          throw "send only one event";
        } else {
          entity = e;
        }
        break;
      }

      default:
        throw "invalid payment type";
    }
  }

  if (entity !== null) {
    const found = await strapi.services[entity.type].findOne({ id: entity.id });
    if (found.currentRegCount >= found.maxRegCount) throw "Max capacity has been reached";

    // let existing = await strapi.services.order.findOne({
    //   "user.id": user.id,
    //   entity: JSON.stringify(events),
    // });

    // if (existing !== null) return { orderId: existing.orderId };
  }

  orderAmount = Math.floor(orderAmount * 100);

  return { orderAmount, userId: user.id, orderBreakdown };
};

module.exports = {
  async startPayment(ctx) {
    const { nanoid } = require("nanoid");
    const axios = require("axios");

    const { refCode, events } = ctx.request.body;

    let res;
    try {
      res = await getOrderDetails({ user: { id: ctx.state.user.id }, events });
    } catch (err) {
      return ctx.badRequest(err);
    }

    const { orderAmount, orderBreakdown, userId } = res;
    if (orderAmount == 0) {
      await onOrderComplete({ user: { id: userId }, entity: events, breakdown: orderBreakdown });
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
        user: { id: userId },
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
  async startSpotPayment(ctx) {
    const { nanoid } = require("nanoid");

    const { events, user } = ctx.request.body;

    let res;
    try {
      res = await getOrderDetails({ user: { ragamId: user }, events });
    } catch (err) {
      return ctx.badRequest(err);
    }

    const { orderAmount, orderBreakdown, userId } = res;

    if (orderAmount == 0) {
      await onOrderComplete({ user: { id: userId }, entity: events, breakdown: orderBreakdown });
      return {
        orderId: null,
      };
    }

    let orderObj = {
      user: { id: userId },
      refCode: "manualreg",
      isPaymentComplete: false,
      orderId: "man-" + nanoid(),
      receipt: nanoid(),
      entity: events,
      breakdown: orderBreakdown,
    };

    await strapi.services.order.create(orderObj);
    return { orderId: orderObj.orderId, orderBreakdown, orderAmount: orderAmount / 100 };
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

  async onSpotRegComplete(ctx) {
    const { orderId } = ctx.request.body;
    let orderObj = await strapi.services.order.findOne({ orderId });
    await strapi.services.order.update({ id: orderObj.id }, { isPaymentComplete: true });

    await onOrderComplete(orderObj);

    return { success: true };
  },
};
