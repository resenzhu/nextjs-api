import {
  type ClientResponse,
  createErrorResponse,
  createSuccessResponse
} from '@utils/response';
import {getItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {Logger} from 'pino';
import type {Socket} from 'socket.io';
import type {User} from '@events/projects/breezy/signup';
import type {UserStatusNotif} from '@events/projects/breezy/login';
import joi from 'joi';
import {sanitize} from 'isomorphic-dompurify';
import {storage} from '@utils/storage';

type UpdateUserStatusReq = {
  status: 'online' | 'appear away' | 'appear offline';
};

const updateUserStatusEvent = (socket: Socket, logger: Logger): void => {
  const event: string = 'update user status';
  socket.on(
    event,
    (
      request: UpdateUserStatusReq,
      callback: (response: ClientResponse) => void
    ): void => {
      logger.info({request: request}, event);
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
        const response: ClientResponse = createErrorResponse({
          code: validationError.message.split('|')[0],
          message: validationError.message.split('|')[1]
        });
        logger.warn({response: response}, `${event} failed`);
        return callback(response);
      }
      let data = validatedValue as UpdateUserStatusReq;
      data = {
        ...data,
        status: sanitize(data.status).trim() as typeof data.status
      };
      storage.then((): void => {
        getItem('breezy users').then((users: User[]): void => {
          let changedUser: User | null = null;
          let timestamp = DateTime.utc().toISO() ?? new Date().toISOString();
          const updatedUsers = users.map((user): User => {
            if (user.session.socket === socket.id) {
              const updatedUser: User = {
                ...user,
                session: {
                  ...user.session,
                  status: data.status,
                  lastOnline:
                    data.status === 'online' || user.session.status === 'online'
                      ? timestamp
                      : user.session.lastOnline
                }
              };
              changedUser = updatedUser;
              timestamp = updatedUser.session.lastOnline;
              return updatedUser;
            }
            return user;
          });
          const ttl = DateTime.max(
            ...updatedUsers.map(
              (user): DateTime =>
                DateTime.fromISO(user.session.lastOnline, {
                  zone: 'utc'
                })
            )
          )
            .plus({weeks: 1})
            .diff(DateTime.utc(), ['milliseconds']).milliseconds;
          setItem('breezy users', updatedUsers, {ttl: ttl}).then((): void => {
            if (changedUser) {
              const userStatusNotif: UserStatusNotif = {
                user: {
                  id: changedUser.id,
                  session: {
                    status: changedUser.session.status
                      .replace('appear', '')
                      .trim() as 'online' | 'away' | 'offline',
                    lastOnline: changedUser.session.lastOnline
                  }
                }
              };
              socket.broadcast.emit('update user status', userStatusNotif);
            }
            const response: ClientResponse = createSuccessResponse({
              data: {
                user: {
                  session: {
                    lastOnline: timestamp
                  }
                }
              }
            });
            logger.info({response: response}, `${event} success`);
            return callback(response);
          });
        });
      });
      return undefined;
    }
  );
};

export type {UpdateUserStatusReq};
export default updateUserStatusEvent;
