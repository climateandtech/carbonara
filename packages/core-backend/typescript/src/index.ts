import { CarbonaraServer } from './server';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

async function main() {
  const server = new CarbonaraServer(PORT);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n⏹️  Shutting down server...');
    server.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n⏹️  Shutting down server...');
    server.stop();
    process.exit(0);
  });
  
  try {
    await server.start();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { CarbonaraServer }; 