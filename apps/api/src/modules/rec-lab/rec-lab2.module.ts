import { Module } from '@nestjs/common';
import { RecLab2Controller } from './rec-lab2.controller';
import { RecLab2Service } from './rec-lab2.service';
import { AuthModule } from '../../auth/auth.module';
// Reuse RecLabModule's EmbeddingService export instead of declaring our own
// provider for it — EmbeddingService loads a local ONNX model on first use,
// so a second independent instance would mean loading it twice in memory.
import { RecLabModule } from './rec-lab.module';

@Module({
  imports: [AuthModule, RecLabModule],
  controllers: [RecLab2Controller],
  providers: [RecLab2Service],
  exports: [RecLab2Service],
})
export class RecLab2Module {}
