import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { USER_STATUS, type PublicUser, type UserRole } from '../users/user.interface.js';

export interface JwtPayload {
  sub: number;
  email: string;
  name: string;
  role: UserRole;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ accessToken: string; user: PublicUser }> {
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid email or password.');

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) throw new UnauthorizedException('Invalid email or password.');

    if (user.status === USER_STATUS.Pending) {
      throw new UnauthorizedException('Your account is awaiting Admin approval.');
    }
    if (user.status === USER_STATUS.Rejected) {
      throw new UnauthorizedException('Your account request was not approved.');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email, name: user.name, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken, user: this.users.toPublic(user) };
  }

  async signup(name: string, email: string, password: string): Promise<PublicUser> {
    return this.users.signup(name, email, password);
  }
}
