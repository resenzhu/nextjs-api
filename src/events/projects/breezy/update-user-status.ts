import {type JwtPayload, verifyJwt} from '@utils/breezy';
import type {ProcedureCallPacket, RowDataPacket} from 'mysql2/promise';
import {type Response, createResponse} from '@utils/response';
import type {User, UserStatusNotif} from '@events/projects/breezy';
import type {Logger} from 'pino';
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
                .execute('CALL SP_BREEZY_GET_ACTIVE_USER_BY_USERID (:userId)', {
                  userId: verifiedJwt.id
                })
                .then((userPacket): void => {
                  const [userResult] = (
                    userPacket[0] as ProcedureCallPacket<RowDataPacket[]>
                  )[0];
                  if (!userResult) {
                    return callback(
                      createResponse({
                        event: event,
                        logger: logger,
                        code: '404',
                        message: 'current user was not found.'
                      })
                    );
                  }
                  connection
                    .execute(
                      'CALL SP_BREEZY_UPDATE_USER (:userId, :userName, :displayName, :password, :sessionId, :socketId, :status, :updateLastOnline)',
                      {
                        userId: userResult.userid,
                        userName: userResult.username,
                        displayName: userResult.displayname,
                        password: userResult.password,
                        sessionId: userResult.sessionid,
                        socketId: userResult.socketid,
                        status: data.status,
                        updateLastOnline:
                          data.status === 'online' ||
                          userResult.status === 'online'
                            ? 1
                            : 0
                      }
                    )
                    .then((): void => {
                      connection
                        .execute(
                          'CALL SP_BREEZY_GET_ACTIVE_USER_BY_USERID (:userId)',
                          {userId: userResult.userid}
                        )
                        .then((updatedUserPacket): void => {
                          const [updatedUserResult] = (
                            updatedUserPacket[0] as ProcedureCallPacket<
                              RowDataPacket[]
                            >
                          )[0];
                          if (!updatedUserResult) {
                            return callback(
                              createResponse({
                                event: event,
                                logger: logger,
                                code: '500',
                                message: 'updated user was not found.'
                              })
                            );
                          }
                          const updatedUser: User = {
                            id: updatedUserResult.userid,
                            userName: updatedUserResult.username,
                            displayName: updatedUserResult.displayname,
                            password: updatedUserResult.password,
                            joinDate: updatedUserResult.createdtime,
                            session: {
                              id: updatedUserResult.sessionid,
                              socket: updatedUserResult.socketid,
                              status: updatedUserResult.status,
                              lastOnline: updatedUserResult.lastonline
                            }
                          };
                          const userStatusNotif: UserStatusNotif = {
                            user: {
                              id: updatedUser.id,
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
                    });
                  return undefined;
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
