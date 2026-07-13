import Joi from "joi";
import {
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../config/authFieldConfig.js";

export { PASSWORD_MIN_LENGTH } from "../config/authFieldConfig.js";

const usernameSchema = Joi.string()
  .trim()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .required()
  .messages({
    "string.min": `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
    "any.required": "Username is required",
  });

const passwordSchema = Joi.string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .required()
  .messages({
    "string.min": `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    "any.required": "Password is required",
  });

const signinSchema = Joi.object({
  username: usernameSchema,
  password: passwordSchema,
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
  password: passwordSchema,
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
