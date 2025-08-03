#!/usr/bin/env node

/**
 * KNX Tunneling Control Example
 * 
 * This example shows how to connect to a KNX/IP interface using tunneling
 * and control various devices like lights, switches, and dimmers.
 */

const { createTunneling, CEMIFrame, CEMIMessageCode, Priority } = require('knxnetjs');

async function main() {
  // Replace with your KNX/IP interface IP address
  const knxGateway = process.env.KNX_GATEWAY || '192.168.1.100';
  
  console.log(`🔌 Connecting to KNX Gateway at ${knxGateway}...`);
  
  // Create tunneling connection
  const connection = createTunneling(knxGateway, 3671);
  
  connection.on('recv', (frame) => {
    console.log(`📥 ${frame.toFormattedString()}`);
  });
  
  connection.on('error', (error) => {
    console.error('❌ Tunneling error:', error.message);
  });
  
  try {
    // Connect to the gateway
    await connection.connect();
    console.log('✅ Connected to KNX gateway');
    
    // Example 1: Turn on light at group address 0/1/1
    console.log('\n💡 Turning on light (0/1/1)...');
    await sendSwitchCommand(connection, 0x0101, true);
    
    await delay(2000);
    
    // Example 2: Turn off light at group address 0/1/1
    console.log('💡 Turning off light (0/1/1)...');
    await sendSwitchCommand(connection, 0x0101, false);
    
    await delay(2000);
    
    // Example 3: Set dimmer to 50% at group address 0/1/2
    console.log('🔅 Setting dimmer to 50% (0/1/2)...');
    await sendDimmerCommand(connection, 0x0102, 50);
    
    await delay(2000);
    
    // Example 4: Send temperature value (20.5°C) to group address 0/2/1
    console.log('🌡️  Sending temperature 20.5°C (0/2/1)...');
    await sendTemperatureCommand(connection, 0x0201, 20.5);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    // Cleanup
    console.log('\n🛑 Disconnecting...');
    await connection.close();
    console.log('✅ Disconnected');
  }
}

/**
 * Send a switch command (on/off)
 */
async function sendSwitchCommand(connection, groupAddress, state) {
  const frame = CEMIFrame.create(
    CEMIMessageCode.L_DATA_REQ,
    0x1101, // Source address
    groupAddress,
    Buffer.from([0x00, state ? 0x81 : 0x80]), // Switch command
    Priority.LOW
  );
  
  await connection.send(frame);
  console.log(`   ✅ Switch ${state ? 'ON' : 'OFF'} sent to ${formatGroupAddress(groupAddress)}`);
}

/**
 * Send a dimmer command (0-100%)
 */
async function sendDimmerCommand(connection, groupAddress, percentage) {
  // Convert percentage to KNX dimming value (0-255)
  const value = Math.round((percentage / 100) * 255);
  
  const frame = CEMIFrame.create(
    CEMIMessageCode.L_DATA_REQ,
    0x1101, // Source address
    groupAddress,
    Buffer.from([0x00, 0x80, value]), // Dimming command
    Priority.LOW
  );
  
  await connection.send(frame);
  console.log(`   ✅ Dimmer ${percentage}% sent to ${formatGroupAddress(groupAddress)}`);
}

/**
 * Send a temperature value (2-byte float, DPT 9.001)
 */
async function sendTemperatureCommand(connection, groupAddress, temperature) {
  // Convert temperature to KNX 2-byte float format (DPT 9.001)
  const temp = Math.round(temperature * 100);
  const mantissa = temp & 0x07FF;
  const exponent = 0;
  const value = (exponent << 11) | mantissa;
  
  const frame = CEMIFrame.create(
    CEMIMessageCode.L_DATA_REQ,
    0x1101, // Source address
    groupAddress,
    Buffer.from([0x00, 0x80, (value >> 8) & 0xFF, value & 0xFF]), // Temperature value
    Priority.LOW
  );
  
  await connection.send(frame);
  console.log(`   ✅ Temperature ${temperature}°C sent to ${formatGroupAddress(groupAddress)}`);
}

/**
 * Format group address for display
 */
function formatGroupAddress(address) {
  const main = (address >> 11) & 0x1F;
  const middle = (address >> 8) & 0x07;
  const sub = address & 0xFF;
  return `${main}/${middle}/${sub}`;
}

/**
 * Simple delay helper
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, exiting...');
  process.exit(0);
});

main().catch(console.error);