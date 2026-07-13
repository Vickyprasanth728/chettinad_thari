import Joi from "joi";
import {
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../config/authFieldConfig.js";

const usernameSchema = Joi.string()
  .trim()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .messages({
    "string.min": `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
    "string.empty": "Username is required",
    "any.required": "Username is required",
  });

const passwordSchema = Joi.string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .messages({
    "string.min": `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    "any.required": "Password is required",
  });

const addUserSchema = Joi.object({
  username: usernameSchema.required(),
  password: passwordSchema.required(),
  name: Joi.string().trim().max(150).allow("", null),
  email: Joi.string().trim().email().max(150).allow("", null),
  mobileno: Joi.alternatives().try(Joi.string(), Joi.number()).allow("", null),
  role_id: Joi.number().integer().positive().required().messages({
    "any.required": "role_id is required",
  }),
  status: Joi.number().integer().valid(0, 1).default(1),
});

const updateUserSchema = Joi.object({
  username: usernameSchema.optional(),
  password: passwordSchema.optional(),
  name: Joi.string().trim().max(150).allow("", null),
  email: Joi.string().trim().email().max(150).allow("", null),
  mobileno: Joi.alternatives().try(Joi.string(), Joi.number()).allow("", null),
  role_id: Joi.number().integer().positive(),
  status: Joi.number().integer().valid(0, 1),
}).min(1);

function runValidation(schema, req, res, next) {
  const { error, value } = schema.validate(req.body, {
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
}

export const validateAddUser = (req, res, next) =>
  runValidation(addUserSchema, req, res, next);

export const validateUpdateUser = (req, res, next) =>
  runValidation(updateUserSchema, req, res, next);
