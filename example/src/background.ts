import { engineRegistry } from '@/engines';
import { setupKernelScript } from 'kernel-script';

setupKernelScript(engineRegistry, {
  debug: true,
});
