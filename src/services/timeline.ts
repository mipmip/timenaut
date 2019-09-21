import Database from "@/services/database";
import {ipcMain} from 'electron'
import log from 'electron-log'
import {TimelineData, TimelineRowData, TimelineTypeData} from "@/models/databaseModels";


export default class Timeline {
    constructor() {
        ipcMain.on('get-timeline-data', async (event: any, time: number) => {
            try {
                event.returnValue = await this.getData(new Date(time));
            } catch (e) {
                log.error(e);
            }
        })
    }

    private static valuesSum(values: { [id: string]: number }): number {
        let total = 0;
        for (let key of Object.keys(values)) {
            total += values[key];
        }
        return total;
    }

    async getData(date: Date): Promise<TimelineData> {
        let results: any = await Database.db.all(`
            SELECT CASE
                       WHEN w.type_str IS NULL
                           THEN p.type_str
                       ELSE w.type_str
                       END                                                                             AS type_,
                   SUM(hb.end_time - hb.start_time)                                                    AS spent_time,
                   datetime(ROUND(hb.start_time / (60 * 10), 0) * (60 * 10), 'unixepoch', 'localtime') AS timeframe,
                   CASE
                       WHEN w.type_str IS NULL
                           THEN pt.color
                       ELSE wt.color
                       END                                                                             AS type_color
            FROM heartbeats AS hb
                     LEFT JOIN
                 windows w ON hb.window_id = w.id
                     LEFT JOIN
                 processes p ON p.id = w.process_id
                     LEFT JOIN
                 productivity_type pt on p.type_str = pt.type
                     LEFT JOIN
                 productivity_type wt on w.type_str = wt.type
            WHERE hb.idle = FALSE
              AND hb.start_time > ?
              AND hb.end_time < ?
            GROUP BY ROUND(hb.start_time / (60 * 10), 0) * (60 * 10),
                     type_`, [
            date.getTime() / 1000 + date.getTimezoneOffset() * 60, // TODO: ugh
            date.getTime() / 1000 + 24 * 60 * 60  // TODO: fix time
        ]);

        let labels = [];
        let values: { [key: string]: number }[] = [];
        let colors: { [key: string]: string } = {};

        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 10) {
                labels.push(h.toString().padStart(2, "0") + ":" + m.toString().padStart(2, "0"));
                values.push({});
            }
        }

        let leftoverTime: { [id: string]: number } = {};

        const today = date.toISOString().substr(0, 10);

        // TODO: fix all this shit

        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 10) {
                for (let value of results) {
                    const curHour = h.toString().padStart(2, "0") + ":" + m.toString().padStart(2, "0");
                    if (value.timeframe.substr(0, 16) === today.substr(0, 10) + " " + curHour) {
                        let time: number = value.spent_time;
                        const color: string = value.type_color;
                        const type: string = value.type_;

                        if (type in leftoverTime) {
                            time += leftoverTime[type];
                            leftoverTime[type] = 0;
                        }

                        const totalAlready: number = Timeline.valuesSum(values[h * 6 + m / 10]);
                        time = Math.min(totalAlready + time, 600) - totalAlready;
                        leftoverTime[value.type_] = Math.max(0, value.spent_time - time);

                        values[h * 6 + m / 10][value.type_] = time;
                        colors[value.type_] = color;
                    }
                }

                for (let value of Object.keys(leftoverTime)) {
                    if (leftoverTime[value] > 0) {
                        let time = leftoverTime[value];

                        const totalAlready: number = Timeline.valuesSum(values[h * 6 + m / 10]);
                        time = Math.min(totalAlready + time, 600) - totalAlready;
                        leftoverTime[value] = Math.max(0, leftoverTime[value] - time);

                        if (value in values[h * 6 + m / 10]) {
                            values[h * 6 + m / 10][value] += time;
                        } else {
                            values[h * 6 + m / 10][value] = time;
                        }
                    }
                }
            }
        }

        let timelineData: TimelineTypeData[] = [];

        // Initiate data for each type
        for (let type of Object.keys(colors)) {
            timelineData.push({
                rows: [],
                color: colors[type]
            });
        }

        for (let i = 0; i < labels.length; i++) {
            let valuesSum: number = 0;

            for (let [idx, type] of Object.keys(colors).entries()) {
                let value: TimelineRowData = {
                    time: labels[i],
                    type: type,
                    value: values[i][type] || 0,
                    offset: valuesSum
                };
                valuesSum += values[i][type] || 0;
                timelineData[idx].rows.push(value);
            }
        }

        return {
            labels: labels,
            types: timelineData
        }
    }
}
