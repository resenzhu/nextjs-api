import type {User, UserStatusNotif} from '@events/projects/breezy';
import {getItem, keys, removeItem, setItem} from 'node-persist';
import {DateTime} from 'luxon';
import type {Socket} from 'socket.io';
import {storage} from '@utils/storage';
import {verify} from 'jsonwebtoken';

export type JwtPayload = {
  id: string;
  session: string;
  iat: number;
  iss: string;
  sub: string;
};

export const verifyJwt = (socket: Socket): Promise<JwtPayload | Error> =>
  new Promise<JwtPayload | Error>((resolve, reject): void => {
    try {
      const decoded = verify(
        socket.handshake.auth.token ?? '',
        Buffer.from(process.env.JWT_KEY_PRIVATE_BASE64, 'base64').toString()
      );
      const jwtPayload = decoded as JwtPayload;
      storage.then((): void => {
        getItem('breezy users')
          .then((users: User[] | undefined): void => {
            if (users) {
              const account = users.find(
                (user): boolean =>
                  user.id === jwtPayload.id &&
                  user.session.id === jwtPayload.session &&
                  DateTime.utc()
                    .endOf('day')
                    .diff(
                      DateTime.fromISO(user.session.lastOnline)
                        .toUTC()
                        .startOf('day'),
                      ['weeks']
                    ).weeks <= 1
              );
              if (!account) {
                reject(new Error('500|user was not found.'));
              }
              let onlineUser: User | null = null;
              const updatedUsers = users.map((user): User => {
                if (
                  user.id === jwtPayload.id &&
                  user.session.id === jwtPayload.session
                ) {
                  const updatedUser: User = {
                    ...user,
                    session: {
                      ...user.session,
                      socket: socket.id,
                      lastOnline:
                        DateTime.utc().toISO() ?? new Date().toISOString()
                    }
                  };
                  onlineUser = updatedUser;
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
              setItem('breezy users', updatedUsers, {ttl: ttl}).then(
                (): void => {
                  if (onlineUser) {
                    const userStatusNotif: UserStatusNotif = {
                      user: {
                        id: onlineUser.id,
                        session: {
                          status: onlineUser.session.status
                            .replace('appear', '')
                            .trim() as 'online' | 'away' | 'offline',
                          lastOnline: onlineUser.session.lastOnline
                        }
                      }
                    };
                    socket.broadcast.emit(
                      'update user status',
                      userStatusNotif
                    );
                  }
                  resolve(jwtPayload);
                }
              );
            } else {
              reject(new Error('500|user was not found.'));
            }
          })
          .catch((storageError: Error): void => {
            keys()
              .then((storageKeys): void => {
                for (const storageKey of storageKeys) {
                  if (storageKey.startsWith('breezy')) {
                    removeItem(storageKey);
                  }
                }
              })
              .finally((): void => {
                reject(
                  new Error(
                    `500#an error occured while accessing the storage file.#${storageError.message}`
                  )
                );
              });
          });
      });
    } catch (jwtError) {
      reject(new Error(`401|token is missing or invalid.|${jwtError}`));
    }
  });
