import { describe, expect, it } from 'vitest';
import { Container, Injectable } from '../src/app/core';

class LoggerService {
  id = Math.random();
}

@Injectable({ scope: 'transient' })
class SessionService {
  id = Math.random();
}

class AuthFacade {
  static inject = [LoggerService, SessionService];

  constructor(
    public readonly logger: LoggerService,
    public readonly session: SessionService,
  ) {}
}

describe('Container', () => {
  it('should resolve constructor dependencies', () => {
    const scoped = new Container();

    scoped.registerClass(LoggerService, { useClass: LoggerService, scope: 'singleton' });
    scoped.registerClass(SessionService, { useClass: SessionService, scope: 'transient' });
    scoped.registerClass(AuthFacade, { useClass: AuthFacade, scope: 'transient' });

    const facade = scoped.resolve<AuthFacade>(AuthFacade);

    expect(facade.logger).toBeInstanceOf(LoggerService);
    expect(facade.session).toBeInstanceOf(SessionService);
  });

  it('should create isolated child scopes', () => {
    const root = new Container();
    root.registerClass(LoggerService, { useClass: LoggerService, scope: 'singleton' });

    const child = root.createScope();
    const rootLogger = root.resolve<LoggerService>(LoggerService);
    const childLogger = child.resolve<LoggerService>(LoggerService);

    expect(rootLogger).toBe(childLogger);

    child.registerClass(SessionService, { useClass: SessionService, scope: 'singleton' });
    const childSession = child.resolve<SessionService>(SessionService);
    expect(childSession).toBeInstanceOf(SessionService);
  });
});
