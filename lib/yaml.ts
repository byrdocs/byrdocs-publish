import { BookData, DocData, FileType, FormData, TestData } from "./types";
import * as YAML from "js-yaml";


export const generateYaml = (fileType: FileType, formData: FormData) => {
  const schemaUrl = `${process.env.NEXT_PUBLIC_BYRDOCS_SITE_URL}/schema/${fileType}.yaml`;

  // 构建YAML对象
  const yamlObject: any = {
    id: formData.id,
    url: formData.url,
    type: formData.type,
    data: {},
  };

  if (fileType === "book") {
    const data = formData.data as BookData;
    yamlObject.data.title = data.title;

    // 只添加非空的数组
    const authors = data.authors.filter((a) => a.trim());
    if (authors.length > 0) {
      yamlObject.data.authors = authors;
    }

    if (data.translators) {
      const translators = data.translators.filter((t) => t.trim());
      if (translators.length > 0) {
        yamlObject.data.translators = translators;
      }
    }

    if (data.edition) yamlObject.data.edition = data.edition;
    if (data.publisher) yamlObject.data.publisher = data.publisher;
    if (data.publish_year) yamlObject.data.publish_year = data.publish_year;

    const isbn = data.isbn.filter((i) => i.trim());
    if (isbn.length > 0) {
      yamlObject.data.isbn = isbn;
    }

    yamlObject.data.filetype = data.filetype;
  } else if (fileType === "test") {
    const data = formData.data as TestData;

    if (data.college) {
      const college = data.college.filter((c) => c.trim());
      if (college.length > 0) {
        yamlObject.data.college = college;
      }
    }

    yamlObject.data.course = {
      name: data.course.name,
    };
    if (data.course.type) {
      yamlObject.data.course.type = data.course.type;
    }

    if (data.time.start || data.time.end || data.time.semester || data.time.stage) {
      yamlObject.data.time = {};
      if (data.time.start) yamlObject.data.time.start = data.time.start;
      if (data.time.end) yamlObject.data.time.end = data.time.end;
      if (data.time.semester) yamlObject.data.time.semester = data.time.semester;
      if (data.time.stage) yamlObject.data.time.stage = data.time.stage;
    }

    yamlObject.data.filetype = data.filetype;

    if (data.content.length > 0) {
      yamlObject.data.content = data.content;
    }
  } else if (fileType === "doc") {
    const data = formData.data as DocData;
    yamlObject.data.title = data.title;
    yamlObject.data.filetype = data.filetype;
    yamlObject.data.course = data.course.map((course) => ({
      ...(course.type && { type: course.type }),
      name: course.name,
    }));

    if (data.content.length > 0) {
      yamlObject.data.content = data.content;
    }
  }

  // 使用js-yaml生成YAML字符串
  const yamlContent = YAML.dump(yamlObject, {
    indent: 2,
    lineWidth: -1, // 不限制行宽
    noRefs: true, // 不使用引用
    quotingType: '"', // 使用双引号
    forceQuotes: false, // 不强制所有字符串都加引号
  });

  // 添加schema注释
  return `# yaml-language-server: $schema=${schemaUrl}\n\n${yamlContent}`;
};
