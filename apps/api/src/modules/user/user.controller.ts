import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../../auth/clerk.guard';
import { UserService } from '../../auth/user.service';

@Controller('users')
@UseGuards(ClerkAuthGuard)
export class UsersController {
  constructor(private readonly userService: UserService) {}

  @Post('ensure')
  async ensureUser(@Req() req: any) {
    await this.userService.ensureUser(req.userId);
    return { success: true };
  }
}
