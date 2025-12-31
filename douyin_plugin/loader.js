import { setupInterceptors } from './interceptor.js';
import { setupUI } from './ui.js';
import { checkForVideoWindows } from './video_enhancer.js';
import { checkAutoResume } from './actions.js';

console.log("Douyin Compass Pro: Ultra Combined Logic Loaded (Modular).");

setupInterceptors();
setupUI();
setInterval(checkForVideoWindows, 1000);
checkAutoResume();