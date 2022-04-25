"use strict";

const { customAlphabet } = require("nanoid");
const nanoid = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 6);

module.exports = {
  lifecycles: {
    async afterCreate(result) {
      while (true) {
        try {
          await strapi.query("user", "users-permissions").update({ id: result.id }, { ragamId: "R22-" + nanoid() });
          break;
        } catch (err) {}
      }

      if (result.email.endsWith("nitc.ac.in")) {
        await strapi
          .query("user", "users-permissions")
          .update({ id: result.id }, { amountPaid: 400, isRagamReg: true, isKalolsavReg: true });
      } else {
        await strapi.query("user", "users-permissions").update({ id: result.id }, { amountPaid: 0 });
      }
    },
  },
};
