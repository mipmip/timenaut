import Database from "@/services/database";
import ProcessModel from "@/models/processModel";

export default class WindowModel {
    id?: number;
    title: string;
    type_str?: string;
    type_color?: string;
    process: ProcessModel;

    constructor(title: string, process: ProcessModel) {
        this.title = title;
        this.process = process;
    }

    async save(): Promise<WindowModel> {
        await Database.db.run(`
            INSERT INTO windows (process_id, title)
            VALUES (?, ?)`, [this.process.id, this.title]);

        let newWindow = await this.find();

        if (newWindow === undefined) {
            throw Error("Could not find just saved window");
        }

        return newWindow;
    }

    async find(): Promise<WindowModel | undefined> {
        let response = await Database.db.one(`
            SELECT *
            FROM windows
            WHERE title = ?
        `, [this.title]) as WindowModel;

        if (response !== undefined) {
            this.id = response.id;
            this.type_str = response.type_str;
            return this;
        } else {
            return undefined;
        }
    }

    public toString = (): string => {
        return `WindowModel [${this.id}]: {${this.title}}`
    }
}
