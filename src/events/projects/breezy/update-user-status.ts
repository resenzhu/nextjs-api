import {type JwtPayload, verifyJwt} from '@utils/breezy';
import {type Response, createResponse} from '@utils/response';
import type {User, UserStatusNotif} from '@events/projects/breezy';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {RowDataPacket} from 'mysql2/promise';
import type {Socket} from 'socket.io';
import {database} from '@utils/database';
import joi from 'joi';
import {sanitize} from 'isomorphic-dompurify';

type UpdateUserStatusReq = {
  status: 'online' | 'appear away' | 'appear offline';
};

const updateUserStatusEvent = (socket: Socket, logger: Logger): void => {
  const event: string = 'update user status';
  socket.on(
    event,
    (
      request: UpdateUserStatusReq,
      callback: (response: Response) => void
    ): void => {
      logger.info({request: request}, event);
      verifyJwt(socket)
        .then((jwtPayload): void => {
          const verifiedJwt = jwtPayload as JwtPayload;
          const requestSchema = joi.object({
            status: joi
              .string()
              .valid('online', 'appear away', 'appear offline')
              .required()
              .messages({
                'string.base': "4220101|'status' must be a string.",
                'string.empty': "4220102|'status' must not be empty.",
                'any.only':
                  "4220103|'status' must be 'online', 'appear away', or 'appear offline'.",
                'any.required': "40001|'status' is required."
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
          let data = validatedValue as UpdateUserStatusReq;
          data = {
            ...data,
            status: sanitize(data.status).trim() as typeof data.status
          };
          database
            .getConnection()
            .then((connection): void => {
              connection
                .execute(
                  `SELECT DISTINCT userid, username, displayname, password, sessionid, socketid, status, lastonline, createdtime FROM breezy_users
                   WHERE userid = :userId AND TIMESTAMPDIFF(DAY, DATE(lastonline), :currentDate) <= 14
                   LIMIT 1`,
                  {
                    userId: verifiedJwt.id,
                    currentDate: DateTime.utc().toISODate()
                  }
                )
                .then((packet): void => {
                  const [userResult] = packet[0] as RowDataPacket[];
                  if (!userResult) {
                    return callback(
                      createResponse({
                        event: event,
                        logger: logger,
                        code: '404',
                        message: 'user was not found.'
                      })
                    );
                  }
                  const existingUser: User = {
                    id: userResult.userid,
                    userName: userResult.username,
                    displayName: userResult.displayname,
                    password: userResult.password,
                    joinDate: userResult.createdtime,
                    session: {
                      id: userResult.sessionid,
                      socket: userResult.socketid,
                      status: userResult.status,
                      lastOnline: userResult.lastonline
                    }
                  };
                  const updatedUser: User = {
                    ...existingUser,
                    session: {
                      ...existingUser.session,
                      status: data.status,
                      lastOnline:
                        data.status === 'online' ||
                        existingUser.session.status === 'online'
                          ? DateTime.utc().toISO()
                          : existingUser.session.lastOnline
                    }
                  };
                  connection
                    .execute(
                      `UPDATE breezy_users
                       SET status = :status, lastonline = :lastOnline, updatedtime = :updatedTime
                       WHERE userid = :userId`,
                      {
                        status: updatedUser.session.status,
                        lastonline: updatedUser.session.lastOnline,
                        updatedTime: DateTime.utc().toISO(),
                        userId: existingUser.id
                      }
                    )
                    .then((): void => {
                      const userStatusNotif: UserStatusNotif = {
                        user: {
                          id: existingUser.id,
                          session: {
                            status: updatedUser.session.status
                              .replace('appear', '')
                              .trim() as 'online' | 'away' | 'offline',
                            lastOnline: updatedUser.session.lastOnline
                          }
                        }
                      };
                      socket.broadcast.emit(
                        'update user status',
                        userStatusNotif
                      );
                      return callback(
                        createResponse({
                          event: event,
                          logger: logger,
                          data: {
                            user: {
                              session: {
                                lastOnline: updatedUser.session.lastOnline
                              }
                            }
                          }
                        })
                      );
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
        .catch((jwtError): void =>
          callback(
            createResponse({
              event: event,
              logger: logger,
              code: jwtError.message.split('|')[0],
              message: jwtError.message.split('|')[1],
              detail:
                jwtError.message.split('|')[2] ?? jwtError.message.split('|')[1]
            })
          )
        );
    }
  );
};

export type {UpdateUserStatusReq};
export default updateUserStatusEvent;
