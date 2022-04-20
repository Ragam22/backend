"use strict";

const { sanitizeEntity } = require("strapi-utils");

module.exports = {
  async findOne(ctx) {
    const slug = ctx.params.id;

    const entity = await strapi.query("event").findOne({ slug });

    if (entity === null) return ctx.badRequest("Invalid Params");

    return sanitizeEntity(entity, { model: strapi.models.event });
  },

  async setWinners(ctx) {
    const eventId = Number.parseInt(ctx.params.id);

    const { winners, publish } = ctx.request.body;

    const winnerStrings = {
      1: [],
      2: [],
      3: [],
    };

    for (const { user: ragamId, prize, position } of winners) {
      const user = await strapi.query("user", "users-permissions").findOne({ ragamId });
      const detailId = user.registeredEvents.find((ued) => ued.event === eventId).id;
      await strapi.services["user-event-detail"].update({ id: detailId.id }, { status: `position_${position}` });

      winnerStrings[position].push(`${position}. ${user.name}, ${user.collegeName}`);
    }

    if (publish) {
      const result = winnerStrings[1].concat(winnerStrings[2]).concat(winnerStrings[3]).join("\n");
      await strapi.services["event"].update({ id: eventId }, { result });
    }

    return { success: true };
  },
};
