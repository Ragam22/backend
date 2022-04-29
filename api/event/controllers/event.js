"use strict";

const { sanitizeEntity } = require("strapi-utils");

module.exports = {
  async findOne(ctx) {
    const slug = ctx.params.id;

    const entity = await strapi.query("event").findOne({ slug });

    if (entity === null) return ctx.badRequest("Invalid Params");

    return sanitizeEntity(entity, { model: strapi.models.event });
  },

  async setResults(ctx) {
    const eventId = Number.parseInt(ctx.params.id);

    const { winners, publish } = ctx.request.body;

    const results = [];

    for (const { user: ragamId, prize, position } of winners) {
      const detailId = (await strapi.query("user", "users-permissions").findOne({ ragamId })).registeredEvents.find(
        (ued) => ued.event === eventId
      )?.id;
      if (!detailId) return ctx.badRequest("user has no reg for this event");
      const detail = await strapi.services["user-event-detail"].findOne({ id: detailId });
      await strapi.services["user-event-detail"].update({ id: detail.id }, { status: `position_${position}` });
      results.push({
        team: detail.teamMembers.map(({ ragamId, name, collegeName, state, district }) => ({
          ragamId,
          name,
          collegeName,
          state,
          district,
        })),
        prize: prize || null,
        position: position,
      });
    }

    await strapi.services.event.update({ id: eventId }, { publishResult: publish || false, result: results });

    return { success: true };
  },

  async getResults(ctx) {
    const events = await strapi.services.event.find({ _limit: 100 });
    const eventResults = events
      .filter((e) => e.publishResult)
      .map(({ id, name, result }) => ({
        id,
        name,
        result,
      }));
    return eventResults;
  },

  async markAttendance(ctx) {
    const eventId = Number.parseInt(ctx.params.id);
    const rId = ctx.params.ragamid;

    const user = await strapi.query("user", "users-permissions").findOne({ ragamId: rId });

    const ued = user.registeredEvents.find((o) => o.event === eventId);
    if (!ued) return ctx.badRequest("user has not registered for this event");

    const mVals = ued.metaValues?.attendance ? ued.metaValues : { ...ued.metaValues, attendance: {} };

    mVals.attendance[rId] = true;

    await strapi.services["user-event-detail"].update({ id: ued.id }, { metaValues: mVals });

    return { success: true };
  },
};
