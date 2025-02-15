const { parentPort, workerData } = require("worker_threads");
const mysqlConn = require("./../modules/HedgingModule/mysqlConn");
const mssqlConn = require("./../modules/HedgingModule/mssqlConn");

const iv = require("implied-volatility");
const fomular = require("./../utils/formula");

const configs = require("./../modules/SupportReportModule/config");
const supportReportService = require("./../database/SupportReportService");
const service = require("./../utils/Service");

// console.log("in woker thread ", workerData.cwList);

const globalHSXList = workerData.hsxList;
const vn30List = workerData.vn30List; // for search underlying symbol of cw

const ivVn30List = workerData.Vn30List; // config for calculate IV

async function storeIvForVn30() {
    try {
        // const xxx = await supportReportService.getSymbolIv();
        // for (const i of xxx) {
        //     const t = new Date(i.today_time);
        //     await mssqlConn.insertToMssql(i.symbol, i.iv, t);
        // }
        const d = configs.INTERVAL;
        for (const us of ivVn30List) {
            const days = parseInt(d) + 1;
            const closePrices = await mysqlConn.getClosePriceSymbol(us, days);

            if (closePrices.status && closePrices.status === "ERROR") {
                // return res.send({
                //     message: closePrices.message,
                //     status: "ERROR"
                // });
                return false;
            }

            const closePriceArr =
                closePrices[0] &&
                closePrices[0].map((item) => item.adjust_price);
            // console.log(closePrices);
            // console.log("symbol = ", us);
            // if (us == "VIB") {
            //     console.log("ddddd");
            // }
            const iv = fomular.hisIV(closePriceArr);

            // store to db
            const refDate = new Date();
            const todayTime = new Date(
                refDate.getFullYear(),
                refDate.getMonth(),
                refDate.getDate(),
                +0,
                +0,
                +0
            ).getTime();
            await mssqlConn.insertToMssql(us, iv, refDate);
            // await mssqlConn.insertToMssql(us, iv, refDate);
            await supportReportService.addSymbolIv(us, days, iv, todayTime);
        }
    } catch (e) {
        console.log(e);
    }
}

// for quick insert
//
const dayList = ["2023-02-27"];

const dateTradingNowFlex = async (arr) => {
    try {
        const arr = [];
        const dateCurrFlex = await mssqlConn.getCurrentDateFlex();
        let date = dateCurrFlex.recordset[0].NgayHienTaiFlex;
        arr.push(date.toISOString("yyyy-MM-dd").substring(0, 10));
        return arr;
    } catch (error) {
        console.log(e);
    }
};

async function getDate() {
    const dateCurrFlex = await mssqlConn.getCurrentDateFlex();
    let date = dateCurrFlex.recordset[0].NgayHienTaiFlex;

    return [date.toISOString("yyyy-MM-dd").substring(0, 10)];
}

async function storeIvForVn30WithDateFrom() {
    try {
        const d = configs.INTERVAL;
        for (const us of ivVn30List) {
            const days = parseInt(d) + 1;
            for (const day of dayList) {
                const closePrices = await mysqlConn.getClosePriceSymbolFromDate(
                    us,
                    days,
                    day
                );

                if (closePrices.status && closePrices.status === "ERROR") {
                    // return res.send({
                    //     message: closePrices.message,
                    //     status: "ERROR"
                    // });
                    return false;
                }

                const closePriceArr =
                    closePrices[0] &&
                    closePrices[0].map((item) => item.adjust_price);

                const iv = fomular.hisIV(closePriceArr);

                // store to db
                const refDate = new Date(day);
                await mssqlConn.insertToMssql(us, iv, refDate);
            }
        }
    } catch (e) {
        console.log(e);
    }
}

function getParamsForBs(snapshotOfCw) {
    const maturityDate = snapshotOfCw.maturity_date;
    if (!maturityDate) {
        return false; // not cw
    }
    let ss = maturityDate.split("/");

    const lastDay = new Date(ss[2], ss[1] - 1, ss[0]);

    const dateNow = new Date();
    dateNow.setHours(0, 0, 0, 0);

    difference = Math.abs(lastDay - dateNow) / (1000 * 3600 * 24);
    // service.globalHSXList
    const foundSymbol = vn30List.find(
        (item) => item.symbol == snapshotOfCw.underlying_symbol
    );
    const ratio = snapshotOfCw.exercise_ratio.split(":");
    let rr = 0;
    if (ratio[0]) {
        rr = parseFloat(ratio[0]);
    }

    // get r of this symbol from db
    const configR = configs.R;
    return {
        sForIv: foundSymbol.prior * 1000, // snapshotOfCw.underlying_price,
        sForPs: foundSymbol.mp != 0 ? foundSymbol.mp : foundSymbol.prior,
        k: snapshotOfCw.exercise_price * 1000,
        t: difference,
        r: configR, // r = 0.03 - 0.08 --> cần lấy từ config
        n: rr,
        expectedCost: CEILINGPRICE //snapshotOfCw.prior * 1000
    };
}

function getParamsForBsFromApiData(snapshotOfCw, snapshotOfUs, cw, todayTimes) {
    if (!snapshotOfCw) {
        return false;
    }
    console.log("cw = ", snapshotOfCw);
    console.log("us = ", snapshotOfUs);
    const { EXERCISERATIO, EXERCISEPRICE, MATURITYDATE, BASICPRICE, SYMBOL } =
        snapshotOfCw;

    const lastDay = new Date(MATURITYDATE);
    lastDay.setHours(0, 0, 0, 0);

    const dateNow = new Date(todayTimes);
    dateNow.setHours(0, 0, 0, 0);

    difference = Math.abs(lastDay - dateNow) / (1000 * 3600 * 24);

    const uS = SYMBOL.substring(1, 4);

    const foundSymbol = vn30List.find((item) => item.symbol == uS);

    const ratio = EXERCISERATIO.split("/");
    let conversionRatio = 0;
    if (ratio[0]) {
        conversionRatio = parseFloat(ratio[0]);
    }

    // get r of this symbol from db
    const configR = configs.R;
    return {
        sForIv:
            snapshotOfUs != undefined
                ? parseFloat(snapshotOfUs[0].adjust_price) * 1000
                : foundSymbol.prior,
        sForPs: foundSymbol.mp != 0 ? foundSymbol.mp : foundSymbol.prior,
        k: EXERCISEPRICE,
        t: difference,
        r: configR, // r = 0.03 - 0.08 --> cần lấy từ config
        n: conversionRatio,
        expectedCost: BASICPRICE //snapshotOfCw.reference
    };
}

async function storeCwIv() {
    const refDate = new Date();
    const todayTime = new Date(
        refDate.getFullYear(),
        refDate.getMonth(),
        refDate.getDate(),
        +0,
        +0,
        +0
    ).getTime();
    for (const cw of configs.CW_LIST) {
        const foundCw = globalHSXList.find((item) => item.symbol == cw);
        // const foundCw = await service.getDatafeed(cw);
        if (!foundCw) {
            return false;
        }
        const { expectedCost, s, k, t, r, sForIv, n } = getParamsForBs(foundCw);

        const iv = calculateIv(expectedCost * n, sForIv, k, t / 365, r);
        // save to db
        await supportReportService.addCwIv(
            cw,
            expectedCost,
            sForIv,
            k,
            r,
            t,
            iv,
            todayTime
        );
    }
}

async function storeCwIvFromApiData() {
    try {
        for (const index in dayList) {
            const todayTime = new Date(dayList[parseInt(index)]);

            const yesterday =
                parseInt(index) > 0
                    ? new Date(dayList[parseInt(index) - 1])
                    : new Date(dayList[parseInt(index)]);
            if (parseInt(index) <= 0)
                yesterday.setDate(yesterday.getDate() - 1);

            for (const cw of configs.CW_LIST) {
                // const foundCw = globalHSXList.find((item) => item.symbol == cw);
                // const foundCw = await service.getDatafeed(cw);
                const foundCw = await mssqlConn.getCwSercuritiesInfo(cw);
                const foundUS = await mysqlConn.getClosePriceSymbolByDate(
                    cw.substring(1, 4),
                    yesterday.getFullYear().toString() +
                        "/" +
                        (yesterday.getMonth() + 1) +
                        "/" +
                        yesterday.getDate()
                );

                if (foundCw) {
                    const { expectedCost, s, k, t, r, sForIv, n } =
                        getParamsForBsFromApiData(
                            foundCw.recordset[0],
                            foundUS[0],
                            cw,
                            todayTime
                        );

                    const iv = calculateIv(
                        expectedCost * n,
                        sForIv,
                        k,
                        t / 365,
                        r
                    );
                    // Store data to db
                    await mssqlConn.insertToMssql(cw, iv, todayTime);
                }
            }
        }
    } catch (e) {
        console.log(e);
    }
}

function calculateIv(
    expectedCost,
    s,
    k,
    t,
    r,
    callPut = "call"
    // estimate = 0.1
) {
    const impliedVol = iv.getImpliedVolatility(
        expectedCost,
        s,
        k,
        t,
        r,
        callPut
    );
    if (impliedVol == null) {
        console.log("impliedVol= ", impliedVol);
    }
    return impliedVol;
}

function updateShareList(symbol, properties) {
    try {
        if (vn30List.length > 0) {
            let index = vn30List.findIndex(
                (element) => element.symbol == symbol
            );
            if (index >= 0) {
                const parsedData = JSON.parse(properties);
                for (const property in parsedData) {
                    if (`${parsedData[property]}` != "") {
                        vn30List[index][property] = parsedData[property];
                    }
                }
                return true;
            }
            console.log("khong tim thay ma chung khoan????uu");
            return false;
        } else {
            console.log("Danh sách chứng khoan chưa được khởi tạo xong!!");
            return false;
        }
    } catch (e) {
        console.log("error = ", e);
    }
}

function updateCwList(symbol, properties) {
    if (globalHSXList.length > 0) {
        let index = globalHSXList.findIndex(
            (element) => element.symbol == symbol
        );
        if (index >= 0) {
            const parsedData = JSON.parse(properties);
            for (const property in parsedData) {
                // console.log(`${property}: ${parsedData[property]}`);
                if (`${parsedData[property]}` != "") {
                    globalHSXList[index][property] = parsedData[property];
                    // delete parsedData[property];
                }
            }
            return true;
        }
        console.log("khong tim thay ma chung quyen????");
        return false;
    } else {
        console.log("Danh sách chứng quyền chưa được khởi tạo xong!-!");
        return false;
    }
}

// Listen for a message from worker
parentPort.on("message", async (result) => {
    // console.log(result);
    try {
        const { orderType, properties, symbol } = result;
        if (orderType === "PROCESS_CW_IV") {
            // console.log("helllo");
            // storeCwIv();
            storeCwIvFromApiData();
        } else if (orderType === "UPDATE_CW") {
            // console.log("update cw list in worker thread");
            // update cw list
            updateCwList(symbol, properties);
        } else if (orderType === "UPDATE_VN30_LIST") {
            // console.log("update VN30 list in worker thread");
            // update VN30 list
            updateShareList(symbol, properties);
        } else if (orderType === "PROCESS_VN30_IV") {
            // console.log("helllo");
            // storeIvForVn30();
            // const fromDate = new Date(2022, 11, 16, 0, 0, 0);
            storeIvForVn30WithDateFrom();
        }
    } catch (e) {
        console.log(e);
    }
});

parentPort.on("error", (error) => {
    console.log(error);
});

parentPort.on("exit", (exitCode) => {
    console.log(exitCode);
});
