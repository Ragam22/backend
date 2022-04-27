"use strict";

const { sanitizeEntity } = require("strapi-utils");

module.exports = {
  async findOne(ctx) {
    const ragamId = ctx.params.id;

    const entity = await strapi.query("user", "users-permissions").findOne({ ragamId });

    if (!entity) return ctx.badRequest("Invalid ID");
    const entity2 = {
      id: entity.id,
      name: entity.name,
      collegeName: entity.collegeName,
    };

    return sanitizeEntity(entity2, {
      model: strapi.plugins["users-permissions"].models.user,
    });
  },

  async me(ctx) {
    const user = ctx.state.user;

    if (!user) return ctx.badRequest("No authorization header was found");

    const userObj = await strapi.query("user", "users-permissions").findOne({ id: user.id });

    //required data
    const filtered = {
      id: userObj.id,
      email: userObj.email,
      name: userObj.name,
      phoneNumber: userObj.phoneNumber,
      ragamId: userObj.ragamId,
      collegeName: userObj.collegeName,
      yearOfStudy: userObj.yearOfStudy,
      state: userObj.state,
      district: userObj.district,
      referralCode: userObj.referralCode,
      registeredEvents: userObj.registeredEvents,
      registeredWorkshops: userObj.registeredWorkshops,
      registeredLectures: userObj.registeredLectures,
      certificates: userObj.certificates,
      gender: userObj.gender,
      isRagamReg: userObj.isRagamReg,
      isKalolsavReg: userObj.isKalolsavReg,
      hostelChoice: userObj.hostelChoice,
      hostelDays: userObj.hostelDays,
    };

    for (let detail of filtered.registeredEvents) {
      let eventObj = await strapi.services["event"].findOne({
        id: detail.event,
      });

      detail.event = {
        id: eventObj.id,
        name: eventObj.name,
        description: eventObj.description,
        // submissionStartDate: eventObj.submissionStartDate,
        // submissionEndDate: eventObj.submissionEndDate,
        coverImage: eventObj.coverImage,
        slug: eventObj.slug,
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

  async findOneAdmin(ctx) {
    const ragamId = ctx.params.ragamid;

    const user = await strapi.query("user", "users-permissions").findOne({ ragamId });

    const filtered = sanitizeEntity(user, {
      model: strapi.plugins["users-permissions"].models.user,
    });

    for (let detail of filtered.registeredEvents) {
      let eventObj = await strapi.services["event"].findOne({
        id: detail.event,
      });

      detail.event = {
        id: eventObj.id,
        name: eventObj.name,
        description: eventObj.description,
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
      };
    }
    for (const detail of filtered.registeredLectures) {
      let lectureObj = await strapi.services["lecture"].findOne({
        id: detail.lecture,
      });
      detail.lecture = {
        id: lectureObj.id,
        name: lectureObj.name,
      };
    }

    return filtered;
  },
};
