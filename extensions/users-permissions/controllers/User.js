'use strict';

const { sanitizeEntity } = require('strapi-utils');

module.exports = {
	async findOne(ctx) {
		const tathvaId = ctx.params.id;

		const entity = await strapi.query('user', 'users-permissions').findOne({ tathvaId });

		if (entity === null)
			return ctx.badRequest("Invalid ID");
		const entity2 = { id: entity.id, name: entity.name, collegeName: entity.collegeName };

		return sanitizeEntity(entity2, { model: strapi.plugins['users-permissions'].models.user });
	},

	async update(ctx){
		
		const currentUserId = ctx.state.user.id;	
	  
		if (currentUserId !== Number.parseInt(ctx.params.id, 10)) {
		  return ctx.unauthorized("Unable to edit this user");
		}
	  
		// Extract the fields regular users should be able to edit
		const { name, phoneNumber, collegeName, yearOfStudy, referralCode } = ctx.request.body;

		const updateData = {
		  name,
		  phoneNumber,
		  collegeName,
		  yearOfStudy,
		  referralCode
		};
	  
		Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
		let entity = await strapi.query('user', 'users-permissions').update({ id: currentUserId }, updateData);
		
		return sanitizeEntity(entity, { model: strapi.plugins['users-permissions'].models.user });
	}


};
