// Imports
import { NextFunction, Request, Response } from "express";
import db from "../../modules/db.js";
import { sendPromiseCatchError, WebErrorNextFunction } from "./error.js";
import formidable, { Fields } from "formidable";
import { createHash } from "crypto";

// Modify express requests to allow auth data.
declare global {
  namespace Express {
    interface Request {
      /** If this user is logged in. */
      loggedIn: boolean;
      /** Session information for the user. Is not defined unless {@link Request.loggedIn} is true. */
      session?: AuthTokenData;
    }
  }
}

// Interfaces for auth data.
export interface AuthUserData {
  username: string;
  name: string;
  email: string;
}
export interface AuthTokenData {
  token: string;
  username: string;
  expires: string;
}
export interface AuthUserAccount {
  username: string;
  hash: string;
}
export interface AuthUserFormData {
  username: string;
  password: string;
  remember_me: boolean;
}
export type AuthUserHashType = "sha1" | "sha256" | "sha512";

// Helper Functions

/** Checks if a date is not expired. */
function checkExpiration(expires: Date): boolean {
  return new Date().getTime() < expires.getTime();
}
/** Gets a date that is `ms` milliseconds before/after the current date. */
function getRelativeDate(ms: number): Date {
  return new Date(new Date().getTime() + ms);
}
/** Turn the formidable `fields` property into something easier to use. */
function makeAuthFormDataReadable(fields: Fields<string>): AuthUserFormData {
  let remember_me: boolean =
    fields.remember_me != null && fields.remember_me[0] === "on";
  return {
    username: fields.username[0],
    password: fields.password[0],
    remember_me,
  };
}
/** Calculate a hash */
function calculateHash(password: string, type: AuthUserHashType): string {
  return createHash(type).update(password, "utf8").digest("hex");
}
/** Checks if an account is valid. */
function verifyAccount(
  incoming: AuthUserFormData,
  existing: AuthUserAccount
): boolean {
  let hash = calculateHash(incoming.password, "sha512");
  return incoming.username === existing.username && hash === existing.hash;
}
/** Generates a session cookie */
function generateSession(username: string): AuthTokenData {
  return {
    username,
    token: calculateHash(new Date().toISOString(), "sha512"),
    expires: getRelativeDate(14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks
  };
}

// Exports

/** Express middleware to check for authentication. */
export function processAuthToken(
  req: Request,
  res: Response,
  next: WebErrorNextFunction
) {
  req.loggedIn = false;
  req.session = null;

  if (req.cookies["Auth-Token"]) {
    let cookie: AuthTokenData = JSON.parse(req.cookies["Auth-Token"]);

    // Get all known tokens.
    db.table<AuthTokenData>("user_auth_tokens")
      .allEntries()
      .then((tokens) => {
        for (let token of tokens) {
          if (
            // Checks if a cookie matches a token and it is not expired, then sets the session.
            token.token === cookie.token &&
            checkExpiration(new Date(token.expires))
          ) {
            req.loggedIn = true;
            req.session = cookie;
            next(); // Go on to next handler.
          } else if (
            // Checks if a cookie matches a token and it is expired, then clears the cookie and token.
            token.token === cookie.token &&
            !checkExpiration(new Date(token.expires))
          ) {
            res.clearCookie("Auth-Token"); // Clear user cookie.
            db.table<AuthTokenData>("user_auth_tokens") // Clear token from db.
              .delete("token", token.token)
              .then(() => {
                next();
              })
              .catch(sendPromiseCatchError(500, req, res, next));
          }
        }

        next(); // Go on to next handler, no matching token found.
      })
      .catch(sendPromiseCatchError(500, req, res, next)); // This will go to the error handler.
  } else {
    next(); // Go on to next handler, no cookie found.
  }
}

/** Process a login attempt. */
export function processLoginAttempt(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Form handler.
  const form = formidable({});

  // Process form data.
  form
    .parse(req)
    .then(([rawFields]) => {
      let incoming = makeAuthFormDataReadable(rawFields);

      // Get all account auth data.
      db.table<AuthUserAccount>("user_accounts")
        .allEntries()
        .then((accs) => {
          // Find the account we want.
          let found = false;
          for (let acc of accs) {
            // Verify acc
            if (verifyAccount(incoming, acc)) {
              found = true;
              // Create session.
              let session = generateSession(acc.username);
              db.table<AuthTokenData>("user_auth_tokens")
                .add(session)
                .then(() => {
                  res.cookie("Auth-Token", JSON.stringify(session));
                  res.redirect("/");
                })
                .catch(sendPromiseCatchError(500, req, res, next));
            }
          }
          // Return to login if failed.
          if (!found) res.redirect("/auth/login");
        })
        .catch(sendPromiseCatchError(500, req, res, next));
    })
    .catch(sendPromiseCatchError(500, req, res, next));
}

export function processLogout(req: Request, res: Response) {}