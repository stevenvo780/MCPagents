#!/usr/bin/env node
import { MCPAutonomousServer } from './server.js';

const server = new MCPAutonomousServer();
server.run().catch(console.error);