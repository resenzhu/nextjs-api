import type {ProcedureCallPacket, RowDataPacket} from 'mysql2/promise';
import {type Response, createResponse} from '@utils/response';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import {database} from '@utils/database';
import {hash} from 'bcrypt';
import joi from 'joi';
import {nanoid} from 'nanoid';
import {sanitize} from 'isomorphic-dompurify';
import {sign} from 'jsonwebtoken';
import {verifyRecaptcha} from '@utils/recaptcha';

type SignUpReq = {
  userName: string;
  displayName: string;
  password: string;
  honeypot: string;
  recaptcha: string;
};

type User = {
  id: string;
  userName: string;
  displayName: string;
  password: string;
  joinDate: string;
  session: {
    id: string;
    socket: string | null;
    status: 'online' | 'away' | 'appear away' | 'offline' | 'appear offline';
    lastOnline: string;
  };
};

type NewUserNotif = {
  user: {
    id: string;
    userName: string;
    displayName: string;
    session: {
      status: 'online' | 'away' | 'offline';
      lastOnline: string;
    };
  };
};

const redact: string[] = [
  'request.password',
  'request.recaptcha',
  'response.data.token'
];

const signupEvent = (socket: Socket, logger: Logger): void => {
  const event: string = 'signup';
  socket.on(
    event,
    (request: SignUpReq, callback: (response: Response) => void): void => {
      logger.info({request: request}, event);
      const requestSchema = joi.object({
        userName: joi
          .string()
          .min(2)
          .max(15)
          .pattern(/^[a-zA-Z0-9_-]+$/u)
          .required()
          .messages({
            'string.base': "4220101|'userName' must be a string.",
            'string.empty': "4220102|'userName' must not be empty.",
            'string.min':
              "4220103|'userName' must be between 2 and 15 characters.",
            'string.max':
              "4220104|'userName' must be between 2 and 15 characters.",
            'string.pattern.base':
              "4220105|'userName' must only contain letters, numbers, hyphen, and underscore.",
            'any.required': "40001|'userName' is required."
          }),
        displayName: joi
          .string()
          .min(2)
          .max(25)
          .pattern(/^[a-zA-Z\s]*$/u)
          .required()
          .messages({
            'string.base': "4220201|'displayName' must be a string.",
            'string.empty': "4220202|'displayName' must not be empty.",
            'string.min':
              "4220203|'displayName' must be between 2 and 25 characters.",
            'string.max':
              "4220204|'displayName' must be between 2 and 25 characters.",
            'string.pattern.base':
              "4220205|'displayName' must only contain letters and spaces.",
            'any.required': "40002|'displayName' is required."
          }),
        password: joi.string().min(8).max(64).required().messages({
          'string.base': "4220301|'password' must be a string.",
          'string.empty': "4220302|'password' must not be empty.",
          'string.min':
            "4220303|'password' must be between 8 and 64 characters.",
          'string.max':
            "4220304|'password' must be between 8 and 64 characters.",
          'any.required': "40003|'password' is required."
        }),
        honeypot: joi.string().allow('').length(0).required().messages({
          'string.base': "4220401|'honeypot' must be a string.",
          'string.length': "4220402|'honeypot' must be empty.",
          'any.required': "40004|'honeypot' is required."
        }),
        recaptcha: joi.string().required().messages({
          'string.base': "4220501|'recaptcha' must be a string.",
          'string.empty': "4220502|'recaptcha' must not be empty.",
          'any.required': "40005|'recaptcha' is required."
        })
      });
      const {value: validatedValue, error: validationError} =
        requestSchema.validate(request);
      if (validationError) {
        return callback(
          createResponse({
            event: event,
            logger: logger,
            code: validationError.message.split('|')[0],
            message: validationError.message.split('|')[1]
          })
        );
      }
      let data = validatedValue as SignUpReq;
      data = {
        ...data,
        userName: sanitize(data.userName).trim().toLowerCase(),
        displayName: sanitize(data.displayName).trim(),
        honeypot: sanitize(data.honeypot).trim(),
        recaptcha: sanitize(data.recaptcha).trim()
      };
      verifyRecaptcha({
        version: 2,
        recaptcha: data.recaptcha
      })
        .then((success): void => {
          if (!success) {
            return callback(
              createResponse({
                event: event,
                logger: logger,
                code: '40304',
                message: 'access denied for bot form submission.'
              })
            );
          }
          database
            .getConnection()
            .then((connection): void => {
              connection
                .execute('CALL SP_BREEZY_PURGE_INACTIVE_USERS')
                .then((): void => {
                  connection
                    .execute(
                      'CALL SP_BREEZY_GET_ACTIVE_USER_BY_USERNAME (:userName)',
                      {userName: data.userName}
                    )
                    .then((packet1): void => {
                      const [userResult1] = (
                        packet1[0] as ProcedureCallPacket<RowDataPacket[]>
                      )[0];
                      if (userResult1) {
                        return callback(
                          createResponse({
                            event: event,
                            logger: logger,
                            code: '40901',
                            message: 'username already exists.'
                          })
                        );
                      }
                      hash(data.password, 10).then((hashedPassword): void => {
                        connection
                          .execute(
                            'CALL SP_BREEZY_REGISTER_USER (:userId, :userName, :displayName, :password, :sessionId, :socketId, :status)',
                            {
                              userId: nanoid(),
                              userName: data.userName,
                              displayName: data.displayName,
                              password: hashedPassword,
                              sessionId: nanoid(),
                              socketId: socket.id,
                              status: 'online'
                            }
                          )
                          .then((): void => {
                            connection
                              .execute(
                                'CALL SP_BREEZY_GET_ACTIVE_USER_BY_USERNAME (:userName)',
                                {userName: data.userName}
                              )
                              .then((packet2): void => {
                                const [userResult2] = (
                                  packet2[0] as ProcedureCallPacket<
                                    RowDataPacket[]
                                  >
                                )[0];
                                if (!userResult2) {
                                  return callback(
                                    createResponse({
                                      event: event,
                                      logger: logger,
                                      code: '500',
                                      message: 'user was not found.'
                                    })
                                  );
                                }
                                const newUser: User = {
                                  id: userResult2.userid,
                                  userName: userResult2.username,
                                  displayName: userResult2.displayname,
                                  password: userResult2.password,
                                  joinDate: userResult2.createdtime,
                                  session: {
                                    id: userResult2.sessionid,
                                    socket: userResult2.socketid,
                                    status: userResult2.status,
                                    lastOnline: userResult2.lastonline
                                  }
                                };
                                const newUserNotif: NewUserNotif = {
                                  user: {
                                    id: newUser.id,
                                    userName: newUser.userName,
                                    displayName: newUser.displayName,
                                    session: {
                                      status: newUser.session.status
                                        .replace('appear', '')
                                        .trim() as
                                        | 'online'
                                        | 'away'
                                        | 'offline',
                                      lastOnline: newUser.session.lastOnline
                                    }
                                  }
                                };
                                socket.broadcast.emit(
                                  'add new user',
                                  newUserNotif
                                );
                                return callback(
                                  createResponse({
                                    event: event,
                                    logger: logger,
                                    data: {
                                      token: sign(
                                        {
                                          id: newUser.id,
                                          session: newUser.session.id
                                        },
                                        Buffer.from(
                                          process.env.JWT_KEY_PRIVATE_BASE64,
                                          'base64'
                                        ).toString(),
                                        {
                                          algorithm: 'RS256',
                                          issuer: 'resen',
                                          subject: newUser.userName
                                        }
                                      )
                                    }
                                  })
                                );
                              });
                          });
                      });
                      return undefined;
                    });
                })
                .finally((): void => {
                  connection.release();
                });
            })
            .catch((connectionError: NodeJS.ErrnoException): void =>
              callback(
                createResponse({
                  event: event,
                  logger: logger,
                  code: '500',
                  message: 'an error occured while connecting to database.',
                  detail: connectionError.message
                })
              )
            );
          return undefined;
        })
        .catch((captchaError: Error): void =>
          callback(
            createResponse({
              event: event,
              logger: logger,
              code: '503',
              message: 'an error occured while verifying captcha.',
              detail: captchaError.message
            })
          )
        );
      return undefined;
    }
  );
};

export {redact};
export type {SignUpReq, User, NewUserNotif};
export default signupEvent;
