import { createCoursesApp } from "../src/app";
import { testCourseCatalog } from "./fixtures/catalog";

const port = Number.parseInt(process.env.PORT ?? "4311", 10);

createCoursesApp({ courses: testCourseCatalog }).listen(port);
