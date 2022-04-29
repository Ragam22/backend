"use strict";

const { sanitizeEntity } = require("strapi-utils");

module.exports = {
  async findOne(ctx) {
    const slug = ctx.params.id;

    const entity = await strapi.query("workshop").findOne({ slug });

    if (entity === null) return ctx.badRequest("Invalid Params");

    return sanitizeEntity(entity, { model: strapi.models.workshop });
  },

  async markAttendance(ctx) {
    const workshopId = Number.parseInt(ctx.params.id);
    const rId = ctx.params.ragamid;

    const user = await strapi.query("user", "users-permissions").findOne({ ragamId: rId });

    const uwd = user.registeredWorkshops.find((o) => o.workshop === workshopId);
    if (!uwd) return ctx.badRequest("user has not registered for this workshop");

    const mVals = uwd.metaValues?.attendance ? uwd.metaValues : { ...uwd.metaValues, attendance: {} };

    mVals.attendance[rId] = true;

    await strapi.services["user-workshop-details"].update({ id: uwd.id }, { metaValues: mVals });

    return { success: true };
  },
};
