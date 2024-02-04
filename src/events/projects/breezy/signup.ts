import {type Response, createResponse} from '@utils/response';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {RowDataPacket} from 'mysql2/promise';
import type {Socket} from 'socket.io';
import {database} from '@utils/database';
import {hash} from 'bcrypt';
import joi from 'joi';
// import {nanoid} from 'nanoid';
import {sanitize} from 'isomorphic-dompurify';
// import {sign} from 'jsonwebtoken';
import {verifyRecaptcha} from '@utils/recaptcha';

type SignUpReq = {
  username: string;
  displayName: string;
  password: string;
  honeypot: string;
  recaptcha: string;
};

type User = {
  id: string;
  username: string;
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
    username: string;
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
        username: joi
          .string()
          .min(2)
          .max(15)
          .pattern(/^[a-zA-Z0-9_-]+$/u)
          .required()
          .messages({
            'string.base': "4220101|'username' must be a string.",
            'string.empty': "4220102|'username' must not be empty.",
            'string.min':
              "4220103|'username' must be between 2 and 15 characters.",
            'string.max':
              "4220104|'username' must be between 2 and 15 characters.",
            'string.pattern.base':
              "4220105|'username' must only contain letters, numbers, hyphen, and underscore.",
            'any.required': "40001|'username' is required."
          }),
        displayName: joi
          .string()
          .min(2)
          .max(25)
          .pattern(/^[a-zA-Z\s]*$/u)
          .required()
          .messages({
            'string.base': "4220101|'displayName' must be a string.",
            'string.empty': "4220102|'displayName' must not be empty.",
            'string.min':
              "4220103|'displayName' must be between 2 and 25 characters.",
            'string.max':
              "4220104|'displayName' must be between 2 and 25 characters.",
            'string.pattern.base':
              "4220105|'displayName' must only contain letters and spaces.",
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
        username: sanitize(data.username).trim().toLowerCase(),
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
                .execute(
                  'SELECT DISTINCT user_id FROM breezy_users WHERE user_name = :userName AND TIMESTAMPDIFF(DAY, DATE(created_at), :currentDate) <= 14',
                  {
                    userName: data.username,
                    currentDate: DateTime.utc().toISODate()
                  }
                )
                .then((rowDataPacket): void => {
                  const rows = rowDataPacket[0] as RowDataPacket[];
                  if (rows.length !== 0) {
                    return callback(
                      createResponse({
                        event: event,
                        logger: logger,
                        code: '40901',
                        message: 'username already exists.'
                      })
                    );
                  }
                  hash(data.password, 10).then((hashedPassword): void => {});
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
          // storage.then((): void => {
          //   getItem('breezy users')
          //     .then((users: User[] | undefined): void => {
          //       const account = users?.find(
          //         (user): boolean =>
          //           user.username === data.username &&
          //           DateTime.utc()
          //             .endOf('day')
          //             .diff(
          //               DateTime.fromISO(user.session.lastOnline)
          //                 .toUTC()
          //                 .startOf('day'),
          //               ['weeks']
          //             ).weeks <= 1
          //       );
          //       if (account) {
          //         const response: ClientResponse = createErrorResponse({
          //           code: '40901',
          //           message: 'username already exists.'
          //         });
          //         logger.warn({response: response}, `${event} failed`);
          //         return callback(response);
          //       }
          //       hash(data.password, 10).then((hashedPassword): void => {
          //         const timestamp =
          //           DateTime.utc().toISO() ?? new Date().toISOString();
          //         const newUser: User = {
          //           id: nanoid(),
          //           username: data.username,
          //           displayName: data.displayName,
          //           password: hashedPassword,
          //           joinDate: timestamp,
          //           session: {
          //             id: nanoid(),
          //             socket: socket.id,
          //             status: 'online',
          //             lastOnline: timestamp
          //           }
          //         };
          //         const updatedUsers = [
          //           ...(users?.filter(
          //             (user): boolean => user.username !== newUser.username
          //           ) ?? []),
          //           newUser
          //         ];
          //         const ttl = DateTime.max(
          //           ...updatedUsers.map(
          //             (user): DateTime =>
          //               DateTime.fromISO(user.session.lastOnline, {
          //                 zone: 'utc'
          //               })
          //           )
          //         )
          //           .plus({weeks: 1})
          //           .diff(DateTime.utc(), ['milliseconds']).milliseconds;
          //         setItem('breezy users', updatedUsers, {ttl: ttl}).then(
          //           (): void => {
          //             const newUserNotif: NewUserNotif = {
          //               user: {
          //                 id: newUser.id,
          //                 username: newUser.username,
          //                 displayName: newUser.displayName,
          //                 session: {
          //                   status: newUser.session.status
          //                     .replace('appear', '')
          //                     .trim() as 'online' | 'away' | 'offline',
          //                   lastOnline: newUser.session.lastOnline
          //                 }
          //               }
          //             };
          //             socket.broadcast.emit('add new user', newUserNotif);
          //             const response: ClientResponse = createSuccessResponse({
          //               data: {
          //                 token: sign(
          //                   {id: newUser.id, session: newUser.session.id},
          //                   Buffer.from(
          //                     process.env.JWT_KEY_PRIVATE_BASE64,
          //                     'base64'
          //                   ).toString(),
          //                   {
          //                     algorithm: 'RS256',
          //                     issuer: 'resen',
          //                     subject: newUser.username
          //                   }
          //                 )
          //               }
          //             });
          //             logger.info({response: response}, `${event} success`);
          //             return callback(response);
          //           }
          //         );
          //       });
          //       return undefined;
          //     })
          //     .catch((storageError: Error): void => {
          //       removeItem('breezy users');
          //       socket.broadcast.emit('force logout');
          //       const response: ClientResponse = createErrorResponse({
          //         code: '500',
          //         message: 'an error occured while accessing the storage file.'
          //       });
          //       logger.warn(
          //         {response: response, error: storageError.message},
          //         `${event} failed`
          //       );
          //       return callback(obfuscateResponse(response));
          //     });
          // });
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
