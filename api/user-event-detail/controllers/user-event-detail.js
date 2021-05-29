"use strict";

const { sanitizeEntity } = require("strapi-utils");

module.exports = {
  async create(ctx) {
    const { user, event, refCode } = ctx.request.body;

    if (user.id !== ctx.state.user.id) return ctx.unauthorized("Unauthorized user access");

    const hasUserRegistered = ctx.state.user["registeredEvents"].find((o) => o.event === event.id);
    if (hasUserRegistered) return ctx.badRequest("Already registered for event");

    let eventObj = await strapi.services.event.findOne({ id: event.id });

    if (!eventObj) return ctx.badRequest("Event does not exist");

    if (eventObj.regPrice !== 0) return ctx.badRequest("This is a paid event");

    let currentDate = new Date();
    if (!(new Date(eventObj.regStartDate) < currentDate && currentDate < new Date(eventObj.regEndDate)))
      return ctx.badRequest("Not in registration period");

    const updateData = {
      teamMembers: [{ id: user.id }],
      event,
      status: "participating",
      eventRefCode: refCode,
    };

    await strapi
      .query("event")
      .model.query((qb) => {
        qb.where("id", eventObj.id);
        qb.increment("currentRegCount", 1);
      })
      .fetch();

    let entity = await strapi.services["user-event-detail"].create(updateData);
    return sanitizeEntity(entity, {
      model: strapi.models["user-event-detail"],
    });
  },

  async findOne(ctx) {
    const paramId = Number.parseInt(ctx.params.id, 10);

    if (!ctx.state.user["registeredEvents"].find((o) => o.id === paramId))
      return ctx.unauthorized("Not a part of this team");

    const detail = await strapi.services["user-event-detail"].findOne({
      id: paramId,
    });
    // const event = await strapi.services.event.findOne({ id: detail.event.id });

    if (Array.isArray(detail.event.commonMetaValues))
      detail.metaValues = detail.event.commonMetaValues.concat(
        Array.isArray(detail.metaValues) ? detail.metaValues : []
      );

    if (Array.isArray(detail.userResponses)) {
      for (let res of detail.userResponses) {
        if (typeof res.response === "number") {
          res.response = detail.submissions.find((o) => o.id === res.response);
        }
      }
    }

    delete detail.submissions;
    delete detail.created_by;
    delete detail.updated_by;
    delete detail.created_at;
    delete detail.updated_at;
    delete detail.published_at;
    return detail;
  },

  async update(ctx) {
    const paramId = Number.parseInt(ctx.params.id, 10);
    let eventDetail = ctx.state.user["registeredEvents"].find((o) => o.id === paramId);

    if (!eventDetail) return ctx.unauthorized("Not a part of this team");

    if (eventDetail.status !== "participating") return ctx.unauthorized("Cannot edit this field");

    const { teamMembers, userResponses } = ctx.request.body;

    const eventObj = await strapi.services.event.findOne({
      id: eventDetail.event,
    });
    eventDetail = await strapi.services["user-event-detail"].findOne({
      id: eventDetail.id,
    }); //get full detail

    const currentDate = new Date();
    let updateData = {};

    if (
      new Date(eventObj.regStartDate) < currentDate &&
      currentDate < new Date(eventObj.regEndDate) &&
      Array.isArray(teamMembers)
    ) {
      if (teamMembers.length > eventObj.maxTeamSize || teamMembers.length < 1)
        return ctx.badRequest("Invalid team size");

      for (const mem of teamMembers) {
        //if already a part of team
        if (eventDetail.teamMembers.find((o) => o.id === mem.id)) continue;

        const newUser = await strapi.query("user", "users-permissions").findOne({ id: mem.id });

        if (!newUser) return ctx.badRequest("Invalid team member id");

        let foundReg = newUser["registeredEvents"].find((o) => o.event === eventDetail.event.id);
        if (foundReg) {
          if (foundReg.submissions.length > 0 || foundReg.userResponses)
            return ctx.badRequest(`TathvaID ${newUser.tathvaId} has pending submissions. Cannot be added.`);

          foundReg = await strapi.services["user-event-detail"].findOne({ id: foundReg.id });

          strapi.log.debug(JSON.stringify(foundReg.teamMembers.length));

          if (foundReg.teamMembers.length > 1)
            return ctx.badRequest(`TathvaID ${newUser.tathvaId} has already joined a team`);

          await strapi.services["user-event-detail"].delete({
            id: foundReg.id,
          });
        }
      }

      updateData.teamMembers = teamMembers;
    }

    if (
      Array.isArray(userResponses) &&
      new Date(eventObj.submissionStartDate) < currentDate &&
      currentDate < new Date(eventObj.submissionEndDate)
    ) {
      updateData.userResponses = eventDetail.userResponses;
      if (!updateData.userResponses) updateData.userResponses = [];

      for (const res of userResponses) {
        const { resId, response } = res;

        let newResponse = updateData.userResponses.find((o) => o.resId === resId);
        if (!newResponse) {
          newResponse = {
            resId: resId,
            response: response,
          };
          updateData.userResponses.push(newResponse);
        }

        const subInfo = eventObj.submissionInfo.find((o) => o.id === resId);

        if (subInfo.submissionType === "textInput" && typeof response !== "string") {
          return ctx.badRequest("Invalid response type");
        } else if (subInfo.submissionType == "fileUpload") {
          if (!eventDetail.submissions.find((o) => o.id === response)) return ctx.badRequest("Invalid submission id");

          newResponse.response = response; //only edit responses for submissions
        }
      }
    }

    await strapi.services["user-event-detail"].update({ id: eventDetail.id }, updateData);
    return updateData;
  },

  async delete(ctx) {
    let paramId = Number.parseInt(ctx.params.id, 10);
    const eventDetail = ctx.state.user["registeredEvents"].find((o) => o.id === paramId);

    if (!eventDetail) return ctx.unauthorized("Not a part of this team");

    const savedSubmissions = (await strapi.services["user-event-detail"].findOne({ id: eventDetail.id })).submissions;
    for (const sub of savedSubmissions) await strapi.plugins["upload"].services.upload.remove(sub);

    const detail = await strapi.services["user-event-detail"].delete({
      id: eventDetail.id,
    });
    detail.metaValues = null;
    return sanitizeEntity(detail, {
      model: strapi.models["user-event-detail"],
    });
  },

  async deleteSubmission(ctx) {
    const detailId = Number.parseInt(ctx.params.detailId);
    const subId = Number.parseInt(ctx.params.submissionId);

    const eventDetail = await strapi.services["user-event-detail"].findOne({
      id: detailId,
    });

    if (!eventDetail.submissions.find((o) => o.id === subId)) return ctx.badRequest("Invalid submission id");

    await strapi.plugins["upload"].services.upload.remove({ id: subId });
    return "Removed";
  },
};
