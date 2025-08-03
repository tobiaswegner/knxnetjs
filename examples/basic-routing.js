#!/usr/bin/env node

/**
 * Basic KNX Routing Example
 * 
 * This example demonstrates how to listen for KNX frames using routing mode
 * and send simple commands to control devices.
 */

const { createRouting, CEMIFrame, CEMIMessageCode, Priority } = require('knxnetjs');

async function main() {
  console.log('🏠 Starting KNX Routing Example...');
  
  // Create a routing connection (multicast)
  const connection = createRouting();
  
  // Listen for incoming KNX frames
  connection.on('recv', (frame) => {
    console.log(`📡 Received: ${frame.toFormattedString()}`);
    console.log(`   From: ${frame.sourceAddressString}`);
    console.log(`   To: ${frame.destinationAddressString}`);
    console.log(`   Data: ${frame.applicationData.toString('hex')}`);
    console.log(`   Priority: ${frame.priorityText}`);
    console.log('');
  });
  
  connection.on('error', (error) => {
    console.error('❌ Connection error:', error.message);
  });
  
  console.log('✅ Listening for KNX frames... (Press Ctrl+C to exit)');
  
  // Send a test frame after 3 seconds
  setTimeout(async () => {
    try {
      console.log('📤 Sending test frame...');
      
      // Create a frame to switch on a light (group address 0/1/1)
      const frame = CEMIFrame.create(
        CEMIMessageCode.L_DATA_REQ,
        0x1101, // Source address: 1.1.1
        0x0101, // Destination address: 0/1/1 (group)
        Buffer.from([0x00, 0x81]), // Data: switch on
        Priority.LOW
      );
      
      await connection.send(frame);
      console.log('✅ Test frame sent successfully');
    } catch (error) {
      console.error('❌ Failed to send frame:', error.message);
    }
  }, 3000);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await connection.close();
    process.exit(0);
  });
}

main().catch(console.error);