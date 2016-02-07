var encodeWithDPT = function(dpt, value) {
  if (dpt === '1.001') {
    if (value.toUpperCase() === 'OFF') {
      return [ 0x80 ];
    } else if (value.toUpperCase() === 'ON') {
      return [ 0x81 ];
    }
  }
  
  if (dpt === '3.007') {
    if (value.toUpperCase() === 'INC') {
      return [ 0x8D ];
    } else if (value.toUpperCase() === 'DEC') {
      return [ 0x85 ];
    }
  }
  
  if (
    (dpt.indexOf('1.') == 0) ||
    (dpt.indexOf('2.') == 0) ||
    (dpt.indexOf('3.') == 0)
    ) {
    return [ 0x80 | (value & 0x1F) ];
  }
  
  if (
    (dpt.indexOf('4.') == 0) ||
    (dpt.indexOf('5.') == 0) ||
    (dpt.indexOf('6.') == 0)
    ) {
    return [ 0x80, value ];
  }

  if (
    (dpt.indexOf('7.') == 0) ||
    (dpt.indexOf('8.') == 0)
    ) {
    return [ 0x80, (value >> 8) & 0xFF, value & 0xFF ];
  }
  
  if (dpt === '9.001') {
    var exponent = 0;
    var sign = 0;
    var mantisse = value * 100;
    
    while (mantisse > 2048) {
      mantisse = mantisse / 2;
      exponent++;
    }
  
    return [ 0x80, ((exponent & 0x0f) << 3) | ((mantisse >> 8) & 0x07), mantisse & 0xff];
  }

  //String
  if (dpt === '16.001') {
    var buffer = [ 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ];
    
    for ( i = 0; (i < 14) && (i < value.length); i++ ) {
      buffer[i + 1] = value.charCodeAt(i) & 0xFF;
    }

    return buffer;
  }
  
  return [ ];
}

var decodeWithDPT = function(dpt, buffer) {
  //1 bit
  if (dpt.indexOf('1.') == 0) {
    var value = 0;
    
    if (buffer[0] == 129) {
      value = 1;
    }
    
    if (dpt === '1.001') {
      if (value) {
        return "On";
      } else {
        return "Off";
      }
    }
    
    if (dpt === '1.019') {
      if (value) {
        return "Open";
      } else {
        return "Closed";
      }
    }
    
    return value.toString();
  }
  
  //4 bit dimming
  if (dpt === '3.007') {
    if (buffer[0] & 0x08) {
      return "INC";
    } else {
      return "DEC";
    }
  }
  
  //1 byte unsigned
  if (dpt.indexOf('5.') == 0) {
    var value = buffer[1];
    
    if (dpt === '5.001') {
      value = value / 2.55;
      
      return value.toString() + " %";
    }
    
    return value.toString();
  }

  //2 byte float
  if (dpt.indexOf('9.') == 0) {
    var mantisse = (((buffer[1] & 7) << 8) + (buffer[2]));
    if (buffer[1] & 0x80)
      mantisse = mantisse * -1;
    var exponent = (buffer[1] >> 3) & 0x0f;
    
    var value = mantisse * Math.pow(2, exponent) * 0.01;
    
    //temperature in celsius
    if (dpt === '9.001') {
      return value.toString() + " °C";
    }

    //brightness in lux
    if (dpt === '9.004') {
      return value.toString() + " Lux";
    }

    //windspeed in m/s
    if (dpt === '9.005') {
      return value.toString() + " m/s";
    }

    return value.toString();
  }
  
  //Time
  if (dpt === '10.001') {
    return (buffer[1] & 0x1F) + ":" + (buffer[2] & 0x3F) + ":" + (buffer[3] & 0x3F);
  }

  //Date
  if (dpt === '11.001') {
    return (buffer[1] & 0x1F) + "." + (buffer[2] & 0x0F) + "." + (buffer[3] & 0x7F);
  }

  //String
  if (dpt === '16.001') {
    var string = "";
    
    for (var i = 0; i < 14; i++) {
      if (buffer[i + 1] == 0) {
        break;
      }
      
      string += String.fromCharCode(buffer[i + 1]);
    }
    
    return string;
  }

  //Beaufort windforce
  if (dpt === '20.014') {
    var value = buffer[1];
    
    return value.toString() + " Bft";
  }
  
  //RHCC
  if (dpt === '22.101') {
    var rhcc = "";
    
    if (buffer[2] & 0x01) {
      rhcc += "Temp. Failure, ";
    }
    
    if (buffer[2] & 0x02) {
      rhcc += "Eco heating, ";
    }
    
    if (buffer[2] & 0x04) {
      rhcc += "TempFlowLimit, ";
    }
    
    if (buffer[2] & 0x08) {
      rhcc += "TempReturnLimit, ";
    }
    
    if (buffer[2] & 0x10) {
      rhcc += "StatusMorningBoost, ";
    }
    
    if (buffer[2] & 0x20) {
      rhcc += "StatusStartOptim, ";
    }
    
    if (buffer[2] & 0x40) {
      rhcc += "StatusStopOptim, ";
    }
    
    if (buffer[2] & 0x80) {
      rhcc += "Heating disabled, ";
    }
    
    if (buffer[1] & 0x01) {
      rhcc += "Heating, ";
    } else {
      rhcc += "Cooling, ";
    }
    
    if (buffer[1] & 0x02) {
      rhcc += "Eco cooling, ";
    }
    
    if (buffer[1] & 0x04) {
      rhcc += "StatusPreCool, ";
    }
    
    if (buffer[1] & 0x08) {
      rhcc += "Cooling disable, ";
    }
    
    if (buffer[1] & 0x10) {
      rhcc += "Dew point alarm, ";
    }
    
    if (buffer[1] & 0x20) {
      rhcc += "Frost alarm, ";
    }
    
    if (buffer[1] & 0x40) {
      rhcc += "Overheat alarm, ";
    }
    
    return rhcc;
  }
  
  //HVAC
  if (dpt === '23.102') {
    var hvac = "";
    
    if ((buffer[1] & 0x03) == 0x00) {
      hvac += "Comfort/Auto, ";
    }

    if ((buffer[1] & 0x03) == 0x01) {
      hvac += "Comfort, ";
    }

    if ((buffer[1] & 0x03) == 0x02) {
      hvac += "Eco, ";
    }

    if ((buffer[1] & 0x03) == 0x03) {
      hvac += "Building protection, ";
    }

    if (buffer[1] & (1 << 5)) {
      hvac += "Heating mode, ";
    } else {
      hvac += "Cooling mode, "
    }
    
    if ((buffer[1] & (1 << 6)) == 0) {
      hvac += "Controller active, ";
    } else {
      hvac += "Controller inactive, ";
    }
        
    if (buffer[1] & 0x80) {
      hvac += "Frost alarm, ";
    }

    return hvac;
  }
  
  return buffer.toString();
}
