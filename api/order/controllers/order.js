'use strict';

module.exports = {
    async startPayment(ctx) {

        const { nanoid } = require('nanoid');
        const axios = require('axios');


        const {user, paymentType, entity, refCode, donationAmount} = ctx.request.body
        
        if(user.id !== ctx.state.user.id){
            return ctx.unauthorized("Invalid User Id");
        }

        let orderObj = {
            user,
            paymentType,
            refCode,
            isPaymentComplete: false
        };

        let orderAmount;

        if(paymentType === "donation"){
            if (typeof donationAmount !== 'number')
                return ctx.badRequest("Please enter an amount to pay");
            orderObj.donationAmount = donationAmount;
            orderAmount = donationAmount;

        } else {
            if (typeof entity === 'undefined')
                return ctx.badRequest("Please enter a valid entity");

            orderObj.entity = {
                id: entity.id
            };

            if(paymentType !== "event" && paymentType !== "workshop" && paymentType !== "lecture")
                return ctx.badRequest("Invalid payment type");
            
            const found = await strapi.services[paymentType].findOne({ id: entity.id });
            if(found === null)
                return ctx.badRequest("Invalid entity id");
            if(found.currentRegCount >= found.maxRegCount)
                return ctx.badRequest("Max capacity has been reached");
            if(found.regPrice === 0)
                return ctx.badRequest("Registration is free!");

            orderAmount = Math.floor(found.regPrice*100);
        }

        let existing = await strapi.services.order.findOne(
            {
                "user.id":      orderObj.user.id,
                "paymentType":  orderObj.paymentType,
                "entity":       JSON.stringify(orderObj.entity)
            }
        );

        if(existing !== null)
            return {orderId: existing.orderId};

        
        const razorpayBody = {
            amount: orderAmount,
            currency: "INR",
            receipt: nanoid()
        }

        const razorAuth = {
            username: process.env.RAZORPAY_USERNAME,
            password: process.env.RAZORPAY_PASSWORD
        }

        try{
            const response = await axios.post("https://api.razorpay.com/v1/orders", razorpayBody, {auth:razorAuth});
            orderObj.orderId = response.data.id;
            orderObj.receipt = response.data.receipt;
            await strapi.services.order.create(orderObj);
            return {orderId: response.data.id};

        } catch (error){
            return ctx.badRequest("Payment Failed");
        }
    },

    async onPaymentComplete(ctx){

        const crypto = require('crypto');
        const shasum = crypto.createHmac('sha256', process.env.RAZORPAY_SECRET);
        shasum.update(JSON.stringify(ctx.request.body));
        const digest = shasum.digest('hex');

        if(digest !== ctx.request.headers['x-razorpay-signature']){
            return ctx.unauthorized("Lies");
        }

        let orderObj = await strapi.services.order.findOne({orderId: ctx.request.body.payload.payment.entity['order_id']});
        await strapi.services.order.update({id: orderObj.id}, {isPaymentComplete: true});

        switch(orderObj.paymentType){
            case "event":
                const eventDetail = {
                    event: orderObj.entity,
                    teamMembers: [orderObj.user],
                    eventRefCode: orderObj.refCode,
                    status: 'participating'
                }
                await strapi.services['user-event-detail'].create(eventDetail);
                break;
            case "workshop":
                const workshopDetail = {
                    workshop: orderObj.entity,
                    user: orderObj.user,
                    workshopRefCode: orderObj.refCode
                }
                await strapi.services['user-workshop-details'].create(workshopDetail);
                break;
            case "lecture":
                const lectureDetail = {
                    lecture: orderObj.entity,
                    user: orderObj.user,
                    lectureRefCode: orderObj.refCode
                }
                await strapi.services['user-lecture-detail'].create(lectureDetail);
                break;
        }
         
        return {status: "ok"};
    }
};
