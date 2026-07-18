import { Module } from '@nestjs/common';
import { RecLab2Controller } from './rec-lab2.controller';
import { RecLab2Service } from './rec-lab2.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [RecLab2Controller],
  providers: [RecLab2Service],
  exports: [RecLab2Service],
})
export class RecLab2Module {}
