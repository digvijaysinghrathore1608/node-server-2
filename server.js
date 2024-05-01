require("dotenv").config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('./db/db_connect');
const Message = require('./model/message');
const Employee = require('./model/employee');
const SiteScrapDB = require('./model/scrap_sites_data');
const keyWordsDB = require('./model/keyWords');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        Credential: true,
    }
});

const port = process.env.PORT || 8000;

// app.use(express.json());
app.use(cors()); // Enable CORS for all routes
app.options('*', cors());
app.use(bodyParser.json({ limit: 'Infinity' }));
app.use(bodyParser.urlencoded({ extended: true, limit: 'Infinity' }));

connectDB(process.env.MONGODB_URL);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
    // res.send("Hello world");
});

app.get('/getData', (req, res) => {
    res.sendFile(__dirname + '/getData.html');
    // res.send("Hello world");
});



// employee tracking start

app.post('/api/employee-login', async (req, res) => {
    try {
        const { emailId, password } = req.body;
        const employeeData = await Employee.findOne({ employeeEmail: emailId });
        if (!employeeData) {
            return res.json({ success: false, message: 'User not found.' });
        }
        const passwordMatch = (password === employeeData.employeePass);
        if (!passwordMatch) {
            return res.json({ success: false, message: 'Incorrect password.' });
        }
        const { _id, employeeName, employeeEmail, employeeId, employeeMobile, active } = employeeData;
        return res.json({
            success: true, employee: {
                _id: _id,
                employeeId: employeeId,
                employeeName: employeeName,
                employeeEmail: employeeEmail,
                employeeMobile: employeeMobile,
                active: active,
            },
        });
    } catch (error) {
        console.error('Error in employee login:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

app.post('/api/employee-checkInCheckOut', async (req, res) => {
    try {
        const currentDate = new Date();
        const createdAt = currentDate.toISOString();
        // Get today's date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const { employeeId, currentLocationData, imageSelfie, checkInCheckOutBool } = req.body;
        // console.log(req.body);

        const employee = await Employee.findOne({ employeeId: employeeId });
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        const filteredCheckInCheckOutData = employee.checkInCheckOutData.filter(data => {
            return data.createAt.setHours(0, 0, 0, 0) === today.getTime() && data.checkInCheckOutBool == checkInCheckOutBool;
        });

        if (filteredCheckInCheckOutData.length == 0) {
            const checkInCheckOutData = {
                currentLocationData: currentLocationData,
                imageSelfie: {
                    data: imageSelfie,
                    contentType: 'image/jpeg'
                },
                checkInCheckOutBool: checkInCheckOutBool,
                createAt: createdAt,
                updateAt: createdAt
            };
            employee.checkInCheckOutData.push(checkInCheckOutData);
            await employee.save();
            return res.json({ success: true, message: 'Check-in data added successfully.', checkInCheckOutBool: checkInCheckOutBool });
        }

        if (filteredCheckInCheckOutData.length == 1 && checkInCheckOutBool == true) {
            const filteredCheckInCheckOutData2 = employee.checkInCheckOutData.filter(data => {
                return data.createAt.setHours(0, 0, 0, 0) === today.getTime() && data.checkInCheckOutBool == false;
            });
            if (filteredCheckInCheckOutData2.length == 1) {
                return res.json({ success: true, message: 'User Today Already Check Out login False', checkInCheckOutBool: false });
            }
            return res.json({ success: true, message: 'User Today Already Check In login true', checkInCheckOutBool: checkInCheckOutBool });
        } else {
            return res.json({ success: false, message: 'other reason' });
        }

    } catch (error) {
        console.error('Error in employee data:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

app.post('/api/employee-visit-data', async (req, res) => {
    try {
        const currentDate = new Date();
        const createdAt = currentDate.toISOString();
        const { employeeId, currentLocationData, imageSelfie, agentMobile, agentName, agentPincode } = req.body;
        const employee = await Employee.findOne({ employeeId: employeeId });
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        const employeeVisitData = {
            currentLocationData: currentLocationData,
            images: [{
                data: imageSelfie,
                contentType: 'image/jpeg'
            }],
            agentName: agentName,
            agentMobile: agentMobile,
            agentPincode: agentPincode,
            createAt: createdAt,
            updateAt: createdAt,
        };
        employee.employeeVisitData.push(employeeVisitData);
        await employee.save();
        return res.json({ success: true, message: 'Employee Visit Data added successfully.' });
    } catch (error) {
        console.error('Error in employee data:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

app.post('/api/employee-visit-data-fetch', async (req, res) => {
    const { employeeId } = req.body;
    const employee = await Employee.findOne({ employeeId: employeeId });
    if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    const filteredEmpVisitedDataSlice = employee.employeeVisitData.slice(Math.max(employee.employeeVisitData.length - 2, 0)).reverse();
    return res.json({ success: true, message: 'Data found', filteredEmpVisitedData: filteredEmpVisitedDataSlice });
});

// employee tracking end


// sites data scrap backend start

app.post('/api/sites-data-scrap-add', async (req, res) => {
    try {
        const { arrayData } = req.body;
        const currentDate = new Date();
        const hours = currentDate.getHours().toString().padStart(2, '0'); // Get hours and pad with leading zero if necessary
        const minutes = currentDate.getMinutes().toString().padStart(2, '0'); // Get minutes and pad with leading zero if necessary
        const seconds = currentDate.getSeconds().toString().padStart(2, '0'); // Get seconds and pad with leading zero if necessary

        const timeString = `${hours}:${minutes}:${seconds}`;

        if (arrayData === undefined || arrayData === null || !Array.isArray(arrayData) || arrayData.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid arrayData' });
        }

        const batchSize = 50;

        if (arrayData.length <= batchSize) {
            const sitesDataInserts = await SiteScrapDB.insertMany(arrayData);
            const totalCount = await SiteScrapDB.countDocuments();
            console.log(` Total ${totalCount} documents Collection and last keyWord => ${arrayData[0].keyWord}, Time -> ${timeString}`);
        } else {
            for (let i = 0; i < arrayData.length; i += batchSize) {
                const chunk = arrayData.slice(i, i + batchSize);
                const sitesDataInserts = await SiteScrapDB.insertMany(chunk);
            }
            const totalCount = await SiteScrapDB.countDocuments();
            console.log(` Total ${totalCount} documents Collection and last keyWord => ${arrayData[0].keyWord}, Time -> ${timeString}`);
        }

        await keyWordsDB.updateOne(
            { keyWord: arrayData[0].keyWord },
            { $set: { useStats: true } }
        );

        res.status(200).json({ success: true, message: `documents inserted` });
    } catch (error) {
        console.error('Error inserting data:', error);
        res.status(500).json({ success: false, message: 'Error inserting data' });
    }
});

app.get('/api/sites-data-scrap-get', async (req, res) => {
    const PAGE_SIZE = 10000;
    try {
        const page = req.query.page ? parseInt(req.query.page) : 1;
        const skip = (page - 1) * PAGE_SIZE;

        const scrapData = await SiteScrapDB.find().skip(skip).limit(PAGE_SIZE).exec();

        res.status(200).json({
            success: true,
            message: `Data Found`,
            data: scrapData,
            nextPage: scrapData.length === PAGE_SIZE ? page + 1 : null
        });
    } catch (error) {
        console.error('Error Get data:', error);
        res.status(500).json({ success: false, message: 'Error Get data' });
    }
});

app.post('/api/sites-data-scrap-key-word-add', async (req, res) => {
    try {
        const { keyWordData } = req.body;
        // console.log(req.body);
        const currentDate = new Date();
        const createAt = currentDate.toISOString();

        const bulkOperations = [];

        for (const data of keyWordData) {
            if (data.keyWord && data.useStatus && data.assignStatus) {
                const setData = {
                    keyWord: data.keyWord,
                    useStats: data.useStatus == 'TRUE' ? 1 : 0,
                    assignStatus: data.assignStatus == 'TRUE' ? 1 : 0,
                    createAt: createAt,
                    updateAt: createAt,
                };

                bulkOperations.push({
                    updateOne: {
                        filter: { keyWord: data.keyWord },
                        update: { $set: setData },
                        upsert: true // Insert if document does not exist
                    }
                });
            }
        }

        if (bulkOperations.length > 0) {
            await keyWordsDB.bulkWrite(bulkOperations);
        }

        res.status(200).json({ success: true, message: `Data Added` });
    } catch (error) {
        console.error('Error key word add data:', error);
        res.status(500).json({ success: false, message: 'Error key word add data' });
    }
});


app.post('/api/sites-data-scrap-key-word-get', async (req, res) => {
    try {
        const currentDate = new Date();
        const createAt = currentDate.toISOString();
        const condition = {
            $or: [
                { useStats: false, assignStatus: false },
                { updateAt: { $lt: new Date(currentDate - (60 * 60 * 1000)) }, assignStatus: true }
            ]
        };
        const keyWordsData = await keyWordsDB.aggregate([
            { $match: condition },
            { $sample: { size: 1 } } // Adjust the size as needed
        ]).exec();
        if (keyWordsData.length > 0) {
            await keyWordsDB.updateOne(
                { _id: keyWordsData[0]._id },
                { $set: { useStats: false, assignStatus: true, updateAt: createAt } }
            );
            res.status(200).json({ success: true, message: `Random data found`, data: keyWordsData });
        } else {
            res.status(404).json({ success: false, message: `No data found for the given condition`, data: [] });
        }
    } catch (error) {
        console.error('Error Get data:', error);
        res.status(500).json({ success: false, message: 'Error Get data' });
    }
});

// sites data scrap backend end



const userSocketMap = {};

io.on('connection', async (socket) => {
    console.log('User Connected', socket.id);

    // Handle login event
    socket.on('login', (userId) => {
        console.log(`User ${userId} logged in`);
        // Store the user ID along with the socket ID
        userSocketMap[userId] = socket.id;
    });

    socket.on('getMessageByGroupId', async (groupId) => {
        try {
            const messages = await Message.find({ groupId: groupId }).sort({ createdAt: 1 }).limit(2);
            console.log('Messages retrieved from MongoDB:', messages);
            socket.emit('updateMessages', messages);
        } catch (error) {
            console.error('Error Fetching message to MongoDB:', error);
        }
    });

    // send message data
    socket.on('message', async (msg) => {
        console.log(userSocketMap);
        console.log('message: ' + msg);

        try {
            const newMessage = new Message(msg);
            await newMessage.save();
            const groupIdMess = msg.groupId;
            const messages = await Message.find({ groupId: groupIdMess });
            const senderSocketId = userSocketMap[msg.senderId];
            const recipientSocketId = userSocketMap[msg.recipientId];

            if (senderSocketId) {
                io.to(senderSocketId).emit('updateMessages', messages);
            }
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('updateMessages', messages);
            }
        } catch (error) {
            console.error('Error saving message to MongoDB:', error);
        }
    });

    socket.on("disconnect", () => {
        const userId = Object.keys(userSocketMap).find(key => userSocketMap[key] === socket.id);
        if (userId) {
            delete userSocketMap[userId];
            console.log(`User ${userId} disconnected`);
        }
    });
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});