"use strict";

const { customAlphabet } = require("nanoid");
const nanoid = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 6);

module.exports = {
  lifecycles: {
    async afterCreate(result) {
      while (true) {
        try {
          await strapi
            .query("user", "users-permissions")
            .update({ id: result.id }, { ragamId: "R22-" + nanoid(), amountPaid: 0 });
          break;
        } catch (err) {}
      }
    },
  },
};
