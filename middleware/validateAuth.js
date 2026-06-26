import Joi from "joi";

const signinSchema = Joi.object({
  username: Joi.string().trim().min(3).max(100).required().messages({
    "string.min": "Username must be at least 3 characters",
    "any.required": "Username is required",
  }),
  password: Joi.string().min(6).max(128).required().messages({
    "string.min": "Password must be at least 6 characters",
    "any.required": "Password is required",
  }),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().min(20).required(),
  userid: Joi.number().integer().positive().required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().email().max(150).required().messages({
    "string.email": "A valid email address is required",
    "any.required": "Email is required",
  }),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().hex().length(64).required().messages({
    "string.length": "Invalid or expired reset token",
    "any.required": "Reset token is required",
  }),
  password: Joi.string().min(6).max(128).required().messages({
    "string.min": "Password must be at least 6 characters",
    "any.required": "Password is required",
  }),
  confirm_password: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords do not match",
    "any.required": "Password confirmation is required",
  }),
});

export const validateSignin = (req, res, next) => {
  const { error, value } = signinSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      status: false,
      message: "Validation failed",
      errors: error.details.map((d) => ({ field: d.path.join("."), message: d.message })),
    });
  }
  req.body = value;
  next();
};

export const validateRefreshToken = (req, res, next) => {
  const { error, value } = refreshSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      status: false,
      message: "Validation failed",
      errors: error.details.map((d) => ({ field: d.path.join("."), message: d.message })),
    });
  }
  req.body = value;
  next();
};

function runValidation(schema, req, res, next) {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    const first = error.details[0];
    return res.status(400).json({
      status: false,
      message: first?.message || "Validation failed",
      errors: error.details.map((d) => ({ field: d.path.join("."), message: d.message })),
    });
  }
  req.body = value;
  next();
}

export const validateForgotPassword = (req, res, next) =>
  runValidation(forgotPasswordSchema, req, res, next);

export const validateResetPassword = (req, res, next) =>
  runValidation(resetPasswordSchema, req, res, next);
