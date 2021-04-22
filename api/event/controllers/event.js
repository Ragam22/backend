'use strict';

const { sanitizeEntity } = require('strapi-utils');

module.exports = {
    async findOne(ctx){
        const slug = ctx.params.id;
            
        const entity = await strapi.query('event').findOne({slug});
        
        if(entity === null)
            return ctx.badRequest("Invalid Params");

        return sanitizeEntity(entity, { model: strapi.models.event });
    }
};
