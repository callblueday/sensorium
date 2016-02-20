/*!
 * Sensorium v0.1.0
 * define actions for snesors or motors etc. in makelock
 * it surports 2560, mcore, orion and zeroPi.
 * Copyright 2015- Makeblock, Inc.
 * Author Hyman
 * Licensed under the MIT license
 */


Sensorium = function(socket) {
    this.socket = socket;

    /* 一些公用变量 */
    this.SETTING = {
        //设备类型
        VERSION: 0, //版本号
        ULTRASONIC_SENSOR:   1,  //超声波
        TEMPERATURE_SENSOR:  2,  //温度
        LIGHT_SENSOR:    3,  // 光线
        POTENTIONMETER:  4,  // 电位计
        JOYSTICK:    5,
        GYRO:    6,
        SOUND_SENSOR:    7,
        RGBLED:  8,
        SEVSEG:  9,
        MOTOR:   10,
        SERVO:   11,
        ENCODER: 12,
        IR:  13,
        IRREMOTE:    14,
        PIRMOTION:   15,
        INFRARED:    16,
        LINEFOLLOWER:    17,
        IRREMOTECODE:    18,
        SHUTTER: 20,
        LIMITSWITCH: 21,
        BUTTON:  22,
        HUMITURE:    23,
        FLAMESENSOR: 24,
        GASSENSOR:   25,
        COMPASS: 26,
        TEMPERATURE:  27,
        DIGITAL: 30,
        ANALOG:  31,
        PWM: 32,
        SERVO_PIN:   33,
        TONE:    34,
        BUTTON_INNER:    35,
        ULTRASONIC_ARDUINO:  36,
        PULSEIN: 37,
        STEPPER: 40, // 通用步进电机
        LEDMATRIX:   41,
        TIMER:   50,
        JOYSTICK_MOVE: 52, // 通用摇杆设备
        COMMON_COMMONCMD: 60, // 针对套件的命令
        ENCODER_BOARD: 61, // 板载编码电机

        /* 发送数据相关 */
        CODE_CHUNK_PREFIX: [255, 85],
        READ_CHUNK_SUFFIX: [13, 10],
        // 回复数据的index位置
        READ_BYTES_INDEX: 2,
        // 发送数据中表示“读”的值
        READMODULE: 1,
        // 发送数据中表示“写”的值
        WRITEMODULE: 2,

        // PORT口
        PORT: {
            "2560": {
                // 通用port口列表
                COMMON_LIST: [6, 7, 8, 9, 10],
                // 板载传感器port口
                LIGHT: 11,
                TEMPERATURE: 13,
                GYROSCOPE: 6,
                VOLUME: 14,
                MOTOR: [1,2],
                LED_PANEL: 0
            },
            "mcore": {
                COMMON_LIST: [1, 2, 3, 4],
                MOTOR: [9,10],
                LED: 7,
                LIGHT: 6
            },
            "orion": {
                COMMON_LIST: [1, 2, 3, 4, 5, 6, 7, 8],
                MOTOR: [9,10]
            },
            "zeroPi": {
                MOTOR: [9,10]
            }
        },

        // tone
        ToneHzTable: {
            // 原始数据：D5: 587 "E5": 658,"F5": 698,"G5": 784,"A5": 880,"B5": 988,"C6": 1047
            "C2": 65,"D2": 73,"E2": 82,"F2": 87,"G2": 98,"A2": 110,"B2": 123,
            "C3": 131,"D3": 147,"E3": 165,"F3": 175,"G3": 196,"A3": 220,
            "B3": 247,"C4": 262,"D4": 294,"E4": 330,"F4": 349,"G4": 392,
            "A4": 440,"B4": 494,"C5": 523,"D5": 555,"E5": 640,"F5": 698,
            "G5": 784,"A5": 880,"B5": 988,"C6": 1047,"D6": 1175,"E6": 1319,
            "F6": 1397,"G6": 1568,"A6": 1760,"B6": 1976,"C7": 2093,"D7": 2349,
            "E7": 2637,"F7": 2794,"G7": 3136,"A7": 3520,"B7": 3951,"C8": 4186
        },

        LINEFOLLOWER_VALUE: {
            'BLACK_BLACK': 128,
            'BLACK_WHITE': 64,
            'WHITE_BLACK': 191,
            'WHITE_WHITE': 0
        },

        LedPosition: {
            LEFT: 1,
            RIGHT: 2,
            BOTH: 0
        }
    };

    this.buffer = [];
    this.tabletTiltLeftRightStatus = 0;
    this.tabletTiltForwardBackwardStatus = 0;
    this.tabletLastShakeTime = 0;
    this.bluetoothConnected = true;
    this.bleLastTimeConnected = true;
    this.isMotorMoving = false;

    this.timer = 800;  // 循环读取数据的时间间隔
};


// 设备相关
Sensorium.prototype.deviceInfo = {};
Sensorium.prototype.getDeviceInfo = function() {
    return this.deviceInfo;
};
Sensorium.prototype.setDeviceInfo = function(data) {
    var type = data.type;
    if(type == "default") {
        type = "mcore";
    }
    this.deviceInfo.type = type;
    this.deviceInfo.portlist = this.SETTING.PORT[type];
};


Sensorium.prototype.action = function() {
    var that = this;
    return {
        baseSpeed: 85,
        timeCount: 0,
        ulTimer: null,   // ultrasoinic timer
        lineTimer: null, // linefollow timer
        lightTimer: null, // light timer
        temperatureTimer: null,
        soundTimer: null,
        pirTimer: null, // 人体红外
        gyroXTimer: null,
        gyroYTimer: null,
        gyroZTimer: null,
        gasTimer: null,
        fireTimer: null,
        humidityTimer: null,
        joystickTimer: null,
        limitSwitchTimer: null,
        potentiometerTimer: null,
        encoderTimer: null,
        turnDegreeSpendTime : null,

        /**
         * --------------------
         * 辅助功能
         * --------------------
         */

        // 读取版本号
        getVersion: function() {
            var cmd = "ff 55 04 00 01 00 00";
            this.sendSerialData(cmd);
        },

        // 读取电量
        getBattery: function() {
            var cmd = "ff 55 04 00 01 3c 70";
            this.sendSerialData(cmd);
        },

        /**
         * 切换固件模式
         * @param {number} device 套件的类别：
         *       0x10： starter(orion)
         *       0x11： auriga
         * @param {number} modeNumber 模式有4种，如下：
         *       00： 蓝牙模式
         *       01： 超声波自动避障
         *       02： 自平衡
         *       03： 红外模式"
         */
        setMode: function(modeNumber) {
            var device;
            var boardType = $("#deviceType").val();
            if(boardType == "2560") {
                device = 0x11;
            } else {
                device = 0X10;
            }
            var cmd = "ff 55 05 00 02 3c "
                + parseInt(device).toString(16) + " "
                + parseInt(modeNumber).toString(16);
            this.sendSerialData(cmd);
        },

        /**
         * --------------------
         * 运动类
         * --------------------
         */

        // 设置直流电机: port口：mbot是09和10，其他是01和02
        setDcMotor: function(speed, port) {
            var cmd = "ff 55 06 00 02 "
                + that.SETTING.MOTOR.toString(16) + " "
                + parseInt(port).toString(16) + " "
                + parseInt(speed).toString(16) + " 00";
            this.sendSerialData(cmd);
        },

        // 设置mzero编码电机
        setEncoderMotor: function(speed, port, slot) {
            var cmd = "ff 55 07 00 02 3d "
                + parseInt(port).toString(16) + " "
                + parseInt(slot).toString(16) + " "
                + (parseInt(speed) & 0xff).toString(16) + " "
                + ((parseInt(speed) >> 8) & 0xff).toString(16);
            this.sendSerialData(cmd);
        },

        // 设置通用编码电机: ff 55 09 00 02 0c 08 01 64 00 e8 03
        // port值为0x08，是系统默认值，该处实际为I²C的值
        setCommonEncoderMotor: function(speed, distance, port, slot) {
            var cmd = "ff 55 09 00 02 0c 08 "
                // + parseInt(port).toString(16) + " "
                + parseInt(slot).toString(16) + " "
                + (parseInt(speed) & 0xff).toString(16) + " "
                + ((parseInt(speed) >> 8) & 0xff).toString(16) + " "
                + (parseInt(distance) & 0xff).toString(16) + " "
                + ((parseInt(distance) >> 8) & 0xff).toString(16);
            this.sendSerialData(cmd);
        },

        // 读取mzero编码电机的值：01表示位置，02表示速度
        // ff 55 06 00 01 3d 00 01 02
        readEncoderMotor: function(type, port, slot) {
            var self = this;
            var cmd = "ff 55 06 00 01 3d "
                + parseInt(port).toString(16) + " "
                + parseInt(slot).toString(16) + " "
                + parseInt(type).toString(16);

            that.encoderTimer = setInterval(function() {
                self.sendSerialData(cmd);
            }, that.timer);
        },
        stopEncoderMotor : function() {
            clearInterval(that.encoderTimer);
        },

        // 设置步进电机
        setStepperMotor: function(speed, distance, port) {
            var cmd = "ff 55 08 00 02 "
                + that.SETTING.STEPPER.toString(16) + " "
                + parseInt(port).toString(16) + " "
                + (parseInt(speed) & 0xff).toString(16) + " "
                + ((parseInt(speed) >> 8) & 0xff).toString(16) + " "
                + (parseInt(distance) & 0xff).toString(16) + " "
                + ((parseInt(distance) >> 8) & 0xff).toString(16);
            this.sendSerialData(cmd);
        },

        // 设置舵机
        setServoMotor: function(angle, port, slot) {
            var cmd = "ff 55 06 00 02 0b "
                + parseInt(port).toString(16) + " "
                + parseInt(slot).toString(16) + " "
                + parseInt(angle).toString(16);
            this.sendSerialData(cmd);
        },


        /**
         * --------------------
         * 传感器类
         * --------------------
         */

        // 超声波
        openUltrasonic : function(port) {
            var self = this;
            var cmd = "ff 55 04 00 01 01 "
                + parseInt(port).toString(16);
            that.ulTimer = setInterval(function() {
                self.sendSerialData(cmd);
            }, that.timer);
        },

        stopUltrasoinic : function() {
            clearInterval(that.ulTimer);
        },

        // 巡线：ff 55 04 00 01 11 05
        openLineFollow : function(port) {
            var self = this;
            var cmd = "ff 55 04 00 01 11 "
                + parseInt(port).toString(16);
            that.lineTimer = setInterval(function() {
                self.sendSerialData(cmd);
            }, that.timer);
        },
        stopLineFollow : function() {
            clearInterval(that.lineTimer);
        },

        // 光线传感器
        openLightSensor : function(port) {
            var self = this;
            var cmd = "ff 55 04 00 01 03 "
                + parseInt(port).toString(16);
            that.lightTimer = setInterval(function() {
                self.sendSerialData(cmd);
            }, that.timer);
        },
        stopLightSensor : function() {
            clearInterval(that.lightTimer);
        },


        // 温度
        openTemperature: function(port) {
            var self = this;
            var cmd = "ff 55 05 00 01 02 "
                + parseInt(port).toString(16)
                + " 01";
            that.temperatureTimer = setInterval(function() {
                self.sendSerialData(cmd);
            }, that.timer);
        },
        stopTemperature: function() {
            clearInterval(that.temperatureTimer);
        },

        // 音量
        openSound: function(port) {
            var self = this;
            var cmd = "ff 55 04 00 01 07 "
                + parseInt(port).toString(16);
            that.soundTimer = setInterval(function() {
                self.sendSerialData(cmd);
            }, that.timer);
        },
        stopSound: function() {
            clearInterval(that.soundTimer);
        },

        // 人体红外
        openPir: function(port) {
            var self = this;
            var cmd = "ff 55 04 00 01 0f "
                + parseInt(port).toString(16);
            that.pirTimer = setInterval(function() {
                self.sendSerialData(cmd);
            }, that.timer);
        },

        stopPir: function() {
            clearInterval(that.pirTimer);
        },

        // 陀螺仪: 01表示X轴，02表示Y轴，03表示Z轴
        getGyro: function(axis, port) {
            port = port ? port : "01";
            axis = axis ? axis : "01";
            var self = this;
            var cmd = "ff 55 05 00 01 06 "
                + parseInt(port).toString(16) + " "
                + axis;

            if(axis == "01") {
                that.gyroXTimer = setInterval(function() {
                    self.sendSerialData(cmd);
                }, that.timer);
            }
            if(axis == "02") {
                that.gyroYTimer = setInterval(function() {
                    self.sendSerialData(cmd);
                }, that.timer);
            }
            if(axis == "03") {
                that.gyroZTimer = setInterval(function() {
                    self.sendSerialData(cmd);
                }, that.timer);
            }
        },

        stopGyro: function() {
            clearInterval(that.gyroXTimer);
            clearInterval(that.gyroYTimer);
            clearInterval(that.gyroZTimer);
        },

        // 湿度
        openHumidity: function(port, slot) {
            var self = this;
            var cmd = "ff 55 05 00 01 02 "
                + parseInt(port).toString(16) + " "
                + parseInt(slot).toString(16);
            that.humidityTimer = setInterval(function() {
                self.sendSerialData(cmd);
            }, that.timer);
        },
        stopHumidity: function() {
            clearInterval(that.humidityTimer);
        },

        // 火焰传感器
        openFire: function(port) {
            var self = this;
            var cmd = "ff 55 05 00 01 02 "
                + parseInt(port).toString(16);
            that.fireTimer = setInterval(function() {
                self.sendSerialData(cmd);
            }, that.timer);
        },
        stopFire: function() {
            clearInterval(that.fireTimer);
        },

        // 气体传感器
        openGas: function(port) {
            var self = this;
            var cmd = "ff 55 04 00 01 19 "
                + parseInt(port).toString(16);
            that.gasTimer = setInterval(function() {
                self.sendSerialData(cmd);
            }, that.timer);
        },
        stopGas: function() {
            clearInterval(that.gasTimer);
        },


        /**
         * --------------------
         * 提示类
         * --------------------
         */

        // led:
        turnOnLed: function(port, slot, position, r, g, b) {
            var cmd = "ff 55 09 00 02 08 "
                + parseInt(port).toString(16) + " "
                + parseInt(slot).toString(16) + " "
                + parseInt(position).toString(16) + " "
                + parseInt(r).toString(16) + " "
                + parseInt(g).toString(16) + " "
                + parseInt(b).toString(16);
            this.sendSerialData(cmd);
        },

        turnOffLed: function(element) {
            var target = $(element).parent().find('button')[0];
            var cmd = "ff 55 09 00 02 08 "
                + parseInt(target.children[0].value).toString(16) + " "
                + parseInt(target.children[1].value).toString(16) + " "
                + parseInt(target.children[2].value).toString(16) + " 0 0 0";
            this.sendSerialData(cmd);
        },

        // tone： ff 55 08 00 02 22 0a 6e 00 f4 01
        playTone: function(port, tone, beat) {
            var cmd;
            var boardType = that.deviceInfo.type;

            if(boardType == "2560") {
                cmd = "ff 55 08 00 02 22 "
                    + parseInt(port).toString(16) + " "
                    + (parseInt(tone) & 0xff).toString(16) + " "
                    + ((parseInt(tone) >> 8) & 0xff).toString(16) + " "
                    + (parseInt(beat) & 0xff).toString(16) + " "
                    + ((parseInt(beat) >> 8) & 0xff).toString(16);
            } else {
                cmd = "ff 55 07 00 02 22 "
                    + (parseInt(tone) & 0xff).toString(16) + " "
                    + ((parseInt(tone) >> 8) & 0xff).toString(16) + " "
                    + (parseInt(beat) & 0xff).toString(16) + " "
                    + ((parseInt(beat) >> 8) & 0xff).toString(16);
            }

            this.sendSerialData(cmd);
        },

        // 数码管: ff 55 08 00 02 09 03 00 00 c8 42
        setTube: function(port, nubmer) {
            var input = parseFloat(nubmer);
            var bytes = float32ToBytes(input);
            var cmd = "ff 55 08 00 02 09 "
                + parseInt(port).toString(16) + " "
                + bytes.join(" ");
            this.sendSerialData(cmd);
        },

        // MP3模块
        setMp3: function() {
            var cmd = "";
            this.sendSerialData(cmd);
        },

        /**
         * --------------------
         * 控制类（向外界输出信号）
         * --------------------
         */

        // 摇杆：01表示x轴，02表示y轴
        readJoystick: function(axis, port) {
            var self = this;
            var cmd = "ff 55 05 00 01 05 "
                + parseInt(port).toString(16) + " "
                + parseInt(axis).toString(16);
            that.joystickTimer = setInterval(function() {
                self.sendSerialData(cmd);
            }, that.timer);
            this.sendSerialData(cmd);
        },
        stopJoystick: function() {
            clearInterval(that.joystickTimer);
        },

        // 设置相机快门
        // action: 00是按下快门，01是松开快门，02是开始对焦，03是停止对焦
        setShutter: function(port, action) {
            var cmd = "ff 55 05 00 02 14 "
                + parseInt(port).toString(16) + " "
                + parseInt(action).toString(16);
            this.sendSerialData(cmd);
        },

        // 设置限位开关
        readLimitSwitch: function(port, slot) {
            var self = this;
            var cmd = "ff 55 05 00 01 15 "
                + parseInt(port).toString(16) + " "
                + parseInt(slot).toString(16);
            that.limitSwitchTimer = setInterval(function() {
                self.sendSerialData(cmd);
            }, that.timer);
        },
        stopLimitSwitch: function() {
            clearInterval(that.limitSwitchTimer);
        },


        // 设置电位器
        readPotentiometer: function(port) {
            var self = this;
            var cmd = "ff 55 04 00 01 04 "
                + parseInt(port).toString(16);
            that.potentiometerTimer = setInterval(function() {
                self.sendSerialData(cmd);
            }, that.timer);
        },
        stopPotentiometer: function() {
            clearInterval(that.potentiometerTimer);
        },

        /**
         * --------------------
         * 其他行为封装
         * --------------------
         */
        stop: function(element) {
            var port = $($(element).parent().find('button')[0]).find('.port').val();
            this.setDcMotor(0, port);
        },
        stopAll: function() {
            MBlockly.Control.stopAll();
        },

        /**
         * send data via serialport
         * @param  {string | array} str decimal interger array.
         * @return void.
         */
        sendSerialData: function(str, type) {
            console.log(str);
            if(typeof(str) == 'object' || type == "chart") {
                var data = {
                    methodName: 'action.sendSerialData',
                    methodParams: str,
                    type: 'serialData',
                    params: str
                }
                console.log(str);
                that.sendRequest(data);
            } else {
                if(str.length) {
                    dataTemp = str.split(" ");
                    var temp = [];
                    for(var i in dataTemp) {
                        var item = parseInt(dataTemp[i], 16); // 16进制转10进制
                        temp.push(item);
                    }
                    var data = {
                        methodName: 'action.sendSerialData',
                        methodParams: str,
                        type: 'serialData',
                        params: temp
                    }
                    that.sendRequest(data);
                }
            }
        }
    };
};


Sensorium.prototype.sendRequest = function(data) {
    this.socket.emit('fromWebClient', data);
};
