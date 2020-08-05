import { Request, Response } from "express";
import db from "../database/connection";
import convertHourInMinutes from "../utils/covertHourInMinutes";

interface ScheduleItem {
  week_day: string;
  from: string;
  to: string;
}

export default class ClassesController {
  async index(request: Request, response: Response) {
    const filters = request.query;
    if (!filters.week_day || !filters.subject || !filters.time) {
      return response.status(400).json({
        error: "Missing filters for classes search",
      });
    }

    const subject = filters.subject as string;
    const week_day = filters.week_day as string;
    const time = filters.time as string;

    const timeInMinutes = convertHourInMinutes(time);
    const timeInMinutesLimit = timeInMinutes + 60;

    const classes = await db("classes")
      .whereExists(function () {
        this.select("class_schedule.*")
          .from("class_schedule")
          .whereRaw("`class_schedule`.`class_id` = `classes`.`id`")
          .whereRaw("`class_schedule`.`week_day` = ??", [Number(week_day)])
          .whereRaw("`class_schedule`.`from` <= ??", [timeInMinutes])
          .whereRaw("`class_schedule`.`to` >= ??", [timeInMinutesLimit]);
      })
      .where("classes.subject", "=", subject)
      .join("users", "classes.user_id", "=", "user_id")
      .select(["classes.*", "users.*"]);

    return response.json({ classes });
  }
  async create(request: Request, response: Response) {
    const {
      name,
      avatar,
      whatsapp,
      bio,
      subject,
      cost,
      schedule,
    } = request.body;

    const trx = await db.transaction();

    try {
      const insertedUsersIds = await trx("users").insert({
        name,
        avatar,
        whatsapp,
        bio,
      });

      const user_id = insertedUsersIds[0];

      const insertedClassesIds = await trx("classes").insert({
        subject,
        cost,
        user_id,
      });

      const class_id = insertedClassesIds[0];

      const classSchedule = schedule.map((scheduleItem: ScheduleItem) => {
        return {
          week_day: scheduleItem.week_day,
          from: convertHourInMinutes(scheduleItem.from),
          to: convertHourInMinutes(scheduleItem.to),
          class_id,
        };
      });

      await trx("class_schedule").insert(classSchedule);
      await trx.commit();

      return response.status(201).json({ message: "criado com sucesso" });
    } catch (err) {
      await trx.rollback();
      return response.status(400).json({
        error: err,
      });
    }
  }
}
