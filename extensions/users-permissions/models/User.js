'use strict';

const { customAlphabet } = require('nanoid');
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6);

module.exports = {

  lifecycles: {
    async afterCreate(result) {
      while(true){
        try{
          await strapi.query('user', 'users-permissions').update({id:result.id}, {tathvaId: "T21-"+nanoid()});
          break;
        } catch(err){
        }
      }
    },
  },
};