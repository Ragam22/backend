require("strapi-utils");

module.exports = async (ctx, next) => {
  const currentUserId = ctx.state.user.id;

  if (currentUserId !== Number.parseInt(ctx.params.id, 10)) {
    return ctx.unauthorized("Unable to edit this user");
  }

  // Extract the fields regular users should be able to edit
  const { name, phoneNumber, collegeName, yearOfStudy, referralCode, state, district, gender } = ctx.request.body;

  const updateData = {
    name,
    phoneNumber,
    collegeName,
    yearOfStudy,
    referralCode,
    state,
    district,
    gender,
  };

  // remove properties from the update object that are undefined (not submitted by the user in the PUT request)
  Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);
  ctx.request.body = updateData;
  return next();
};
