"use strict";

const { sanitizeEntity } = require("strapi-utils");

module.exports = {
  async findOne(ctx) {
    const tathvaId = ctx.params.id;

    const entity = await strapi
      .query("user", "users-permissions")
      .findOne({ tathvaId });

    if (entity === null) return ctx.badRequest("Invalid ID");
    const entity2 = {
      id: entity.id,
      name: entity.name,
      collegeName: entity.collegeName,
    };

    return sanitizeEntity(entity2, {
      model: strapi.plugins["users-permissions"].models.user,
    });
  },

  async update(ctx) {
    const currentUserId = ctx.state.user.id;

    if (currentUserId !== Number.parseInt(ctx.params.id, 10)) {
      return ctx.unauthorized("Unable to edit this user");
    }

    // Extract the fields regular users should be able to edit
    const {
      name,
      phoneNumber,
      collegeName,
      yearOfStudy,
      referralCode,
      state,
      district,
    } = ctx.request.body;

    const updateData = {
      name,
      phoneNumber,
      collegeName,
      yearOfStudy,
      referralCode,
      state,
      district,
    };

    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );
    let entity = await strapi
      .query("user", "users-permissions")
      .update({ id: currentUserId }, updateData);

    return sanitizeEntity(entity, {
      model: strapi.plugins["users-permissions"].models.user,
    });
  },

  async me(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.badRequest(null, [
        { messages: [{ id: "No authorization header was found" }] },
      ]);
    }

    const userObj = await strapi
      .query("user", "users-permissions")
      .findOne({ id: ctx.state.user.id });

    //required data
    const filtered = {
      id: userObj.id,
      email: userObj.email,
      name: userObj.name,
      phoneNumber: userObj.phoneNumber,
      tathvaId: userObj.tathvaId,
      collegeName: userObj.collegeName,
      yearOfStudy: userObj.yearOfStudy,
      state: userObj.state,
      district: userObj.district,
      referralCode: userObj.referralCode,
      registeredEvents: userObj.registeredEvents,
      registeredWorkshops: userObj.registeredWorkshops,
      registeredLectures: userObj.registeredLectures,
    };

    for (let detail of filtered.registeredEvents) {
      let eventObj = await strapi.services["event"].findOne({
        id: detail.event,
      });

      detail.event = {
        id: eventObj.id,
        name: eventObj.name,
        description: eventObj.description,
        submissionStartDate: eventObj.submissionStartDate,
        submissionEndDate: eventObj.submissionEndDate,
        coverImage: eventObj.coverImage,
      };
      delete detail.submissions;
    }
    for (const detail of filtered.registeredWorkshops) {
      let workshopObj = await strapi.services["workshop"].findOne({
        id: detail.workshop,
      });
      detail.workshop = {
        id: workshopObj.id,
        name: workshopObj.name,
        description: workshopObj.description,
        coverImage: workshopObj.coverImage,
      };
    }
    for (const detail of filtered.registeredLectures) {
      let lectureObj = await strapi.services["lecture"].findOne({
        id: detail.lecture,
      });
      detail.lecture = {
        id: lectureObj.id,
        name: lectureObj.name,
        description: lectureObj.description,
        coverImage: lectureObj.coverImage,
      };
    }

    return filtered;
  },
};
