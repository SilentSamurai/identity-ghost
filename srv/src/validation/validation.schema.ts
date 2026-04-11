import * as yup from "yup";
import {isDate, parse} from "date-fns";

export const USERNAME_REGEXP = /^[a-zA-Z]+(.){2,20}$/;
export const USERNAME_MESSAGE =
    "Username must start with an alpha character and contain from 3 to 20 characters";

export const PASSWORD_REGEXP = /^[a-zA-Z]+(.){7,20}$/;
export const PASSWORD_MESSAGE =
    "Password must start with an alpha character and contain from 8 to 20 characters";

yup.addMethod(
    yup.string,
    "defined",
    function (msg = "Parameter must be defined") {
        return this.test(
            "defined",
            msg,
            (value) => value !== undefined && value !== null,
        );
    },
);

function parseDateString(value, originalValue) {
    const parsedDate: any = isDate(originalValue)
        ? originalValue
        : parse(originalValue, "yyyy-MM-dd", new Date());
    return parsedDate;
}

const SignUpSchema = yup.object().shape({
    name: yup
        .string()
        .required("name is required")
        .max(128)
        .matches(USERNAME_REGEXP, USERNAME_MESSAGE),
    password: yup
        .string()
        .required("Password is required")
        .max(128)
        .matches(PASSWORD_REGEXP, PASSWORD_MESSAGE),
    email: yup.string().email().required("Email is required").max(128),
});

const SignDownSchema = yup.object().shape({
    password: yup
        .string()
        .required("Password is required")
        .matches(PASSWORD_REGEXP, PASSWORD_MESSAGE)
        .max(128),
});

const ForgotPasswordSchema = yup.object().shape({
    email: yup.string().email().required("Email is required").max(128),
});

const ResetPasswordSchema = yup.object().shape({
    password: yup
        .string()
        .required("Password is required")
        .matches(PASSWORD_REGEXP, PASSWORD_MESSAGE)
        .max(128),
});

const UpdateMyUsernameSchema = yup.object().shape({
    username: yup
        .string()
        .required("Username is required")
        .matches(USERNAME_REGEXP, USERNAME_MESSAGE)
        .max(128),
    password: yup
        .string()
        .required("Password is required")
        .matches(PASSWORD_REGEXP, PASSWORD_MESSAGE)
        .max(128),
});

const UpdateUsernameSchema = yup.object().shape({
    username: yup
        .string()
        .required("Username is required")
        .matches(USERNAME_REGEXP, USERNAME_MESSAGE)
        .max(128),
});

const UpdateMyEmailSchema = yup.object().shape({
    email: yup.string().email().required("Email is required").max(128),
});

const UpdateMyPasswordSchema = yup.object().shape({
    currentPassword: yup
        .string()
        .required("Current password is required")
        .matches(PASSWORD_REGEXP, PASSWORD_MESSAGE)
        .max(128),
    newPassword: yup
        .string()
        .required("New password is required")
        .matches(PASSWORD_REGEXP, PASSWORD_MESSAGE)
        .max(128),
});

const UpdateMyNameSchema = yup.object().shape({
    name: yup.string().defined("Name is required").max(128),
});

const UpdateNameSchema = yup.object().shape({
    name: yup.string().defined("Name is required").max(128),
});

const UpdateMySurnameSchema = yup.object().shape({
    surname: yup.string().defined("Name is required").max(128),
});

const UpdateSurnameSchema = yup.object().shape({
    surname: yup.string().defined("Name is required").max(128),
});

const UpdateMyBirthdateSchema = yup.object().shape({
    birthdate: yup
        .date()
        .required("Birthdate is required")
        .transform(parseDateString)
        .typeError("Invalid birthdate format YY/MM/DD"),
});

const UpdateBirthdateSchema = yup.object().shape({
    birthdate: yup
        .date()
        .required("Birthdate is required")
        .transform(parseDateString)
        .typeError("Invalid birthdate format YY/MM/DD"),
});

const DeleteUserSchema = yup.object().shape({});

const CreateTenantSchema = yup.object().shape({
    name: yup.string().required("Name is required").max(20),
    domain: yup.string().required("Domain is required").max(100),
});

const UpdateTenantSchema = yup.object().shape({
    name: yup.string().max(20).required(),
});

const CreateRoleSchema = yup.object().shape({
    name: yup.string().required("Name is required").max(20),
    tenantId: yup.string().required("TenantId is required"),
});

const OperatingRoleSchema = yup.object().shape({
    scopes: yup.array().of(yup.string().max(20)),
});

const MemberOperationsSchema = yup.object().shape({
    tenantId: yup.string().required("TenantId is required"),
    email: yup.string().required("Email is required").max(128),
});

const CreateUserSchema = yup.object().shape({
    email: yup.string().email().required("Email is required").max(128),
    name: yup.string().required("Name is required").max(128),
    password: yup
        .string()
        .required("Password is required")
        .matches(PASSWORD_REGEXP, PASSWORD_MESSAGE),
});

const UpdateUserSchema = yup.object().shape({
    id: yup.string().required("Id is required"),
    email: yup.string().max(128).email().nullable(),
    name: yup.string().max(128).nullable()
});

const LoginSchema = yup.object().shape({
    email: yup.string().email().required("Email is required").max(128),
    password: yup
        .string()
        .required("Password is required")
        .matches(PASSWORD_REGEXP, PASSWORD_MESSAGE)
        .max(128),
    client_id: yup.string().required("client_id is required"),
    code_challenge_method: yup
        .string()
        .required()
        .matches(/^(plain|S256|OWH32)$/, "method is required")
        .default("plain"),
    code_challenge: yup.string().required("code_challenge is required"),
    subscriber_tenant_hint: yup.string().optional().nullable(),
    redirect_uri: yup.string().optional(),
    scope: yup.string().optional(),
    nonce: yup.string().optional().max(512),
});

const PasswordGrantSchema = yup.object().shape({
    grant_type: yup
        .string()
        .required()
        .matches(/^password$/g, {message: "grant type not recognised"}),
    username: yup.string().email().required("Username is required").max(128),
    password: yup
        .string()
        .required("Password is required")
        .matches(PASSWORD_REGEXP, PASSWORD_MESSAGE)
        .max(128),
    client_id: yup.string().required("client_id is required"),
    subscriber_tenant_hint: yup.string().nullable(),
    scope: yup.string().optional(),
});

const ClientCredentialGrantSchema = yup.object().shape({
    grant_type: yup
        .string()
        .required()
        .matches(/^client_credentials$/g, {
            message: "grant type not recognised",
        }),
    client_id: yup.string().required("client_id is required"),
    client_secret: yup.string().required("client_secret is required"),
    scope: yup.string().optional(),
});

const RefreshTokenGrantSchema = yup.object().shape({
    grant_type: yup
        .string()
        .required()
        .matches(/^refresh_token$/g, {message: "grant type not recognised"}),
    refresh_token: yup.string().required("refresh_token is required"),
    client_id: yup.string().required("client_id is required"),
    client_secret: yup.string().optional(),
    scope: yup.string().optional(),
});

const CodeGrantSchema = yup.object().shape({
    grant_type: yup
        .string()
        .required()
        .matches(/^authorization_code$/g, {
            message: "grant type not recognised",
        }),
    code: yup.string().required("code is required"),
    code_verifier: yup.string()
        .required("code_verifier is required")
        .min(43, "code_verifier must be at least 43 characters")
        .max(128, "code_verifier must be at most 128 characters")
        .matches(/^[A-Za-z0-9\-._~]+$/, "code_verifier contains invalid characters"),
    client_id: yup.string().required("client_id is required"),
    subscriber_tenant_hint: yup.string().nullable(),
    scope: yup.string().optional(),
    redirect_uri: yup.string().optional(),
});

const VerifyTokenSchema = yup.object().shape({
    access_token: yup.string().required("access_token is required"),
    client_id: yup.string().required("client_id is required"),
    client_secret: yup.string().required("client_secret is required"),
});

const ExchangeTokenSchema = yup.object().shape({
    access_token: yup.string().required("access_token is required"),
    client_id: yup.string().required("client_id is required"),
    client_secret: yup.string().required("client_secret is required"),
});

const RefreshTokenSchema = yup.object().shape({
    email: yup.string().required("token is invalid").max(128),
    domain: yup.string().required("token is invalid"),
});

const CreateGroupSchema = yup.object().shape({
    name: yup.string().required("Name is required").max(128),
    tenantId: yup.string().required("tenantId is required").max(100),
});

const UpdateGroupSchema = yup.object().shape({
    name: yup.string().required("Name is required").max(128),
});

const UpdateGroupRole = yup.object().shape({
    roles: yup.array().of(yup.string().max(128)),
});

const UpdateGroupUser = yup.object().shape({
    users: yup.array().of(yup.string().max(128)),
});

const VerifyAuthCodeSchema = yup.object().shape({
    auth_code: yup.string().required("auth_code is required"),
    client_id: yup.string().required("client_id is required"),
});

export const ValidationSchema = {
    SignUpSchema,
    SignDownSchema,
    LoginSchema,
    PasswordGrantSchema,
    ClientCredentialGrantSchema,
    RefreshTokenGrantSchema,
    CodeGrantSchema,
    ForgotPasswordSchema,
    ResetPasswordSchema,
    UpdateMyUsernameSchema,
    UpdateUsernameSchema,
    UpdateMyEmailSchema,
    UpdateMyPasswordSchema,
    UpdateMyNameSchema,
    UpdateNameSchema,
    UpdateMySurnameSchema,
    UpdateSurnameSchema,
    UpdateMyBirthdateSchema,
    UpdateBirthdateSchema,
    DeleteUserSchema,
    CreateTenantSchema,
    UpdateTenantSchema,
    CreateRoleSchema: CreateRoleSchema,
    OperatingRoleSchema: OperatingRoleSchema,
    MemberOperationsSchema,
    CreateUserSchema,
    UpdateUserSchema,
    VerifyTokenSchema,
    ExchangeTokenSchema,
    RefreshTokenSchema,
    CreateGroupSchema,
    UpdateGroupRole,
    UpdateGroupUser,
    UpdateGroupSchema,
    VerifyAuthCodeSchema,
};
