import { FileType } from "./types";

const cleanURL = (url: string): URL => {
  try {
    const urlObj = new URL(url);
    urlObj.search = "";
    urlObj.hash = "";
    return urlObj;
  } catch (error) {
    return new URL(url);
  }
};

export const validateYearRange = (
  startYear: string,
  endYear: string
): { isValid: boolean; error?: string } => {
  // 开始年份和结束年份都是必填项
  if (!startYear) {
    return { isValid: false, error: "开始年份是必填项" };
  }

  if (!endYear) {
    return { isValid: false, error: "结束年份是必填项" };
  }

  // 验证是否为整数
  if (!/^\d+$/.test(startYear.trim())) {
    return { isValid: false, error: "开始年份必须是整数" };
  }

  if (!/^\d+$/.test(endYear.trim())) {
    return { isValid: false, error: "结束年份必须是整数" };
  }

  const start = parseInt(startYear);
  const end = parseInt(endYear);
  const now = new Date();
  const currentYear = now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();

  if (start < 2000 || start > currentYear) {
    return {
      isValid: false,
      error: `开始年份必须在 2000 到 ${currentYear} 之间`,
    };
  }

  if (end < 2000 || end > currentYear) {
    return {
      isValid: false,
      error: `结束年份必须在 2000 到 ${currentYear} 之间`,
    };
  }

  if (end !== start && end !== start + 1) {
    return { isValid: false, error: "结束年份必须等于开始年份或开始年份+1" };
  }

  return { isValid: true };
};

export const validateYear = (year: string): boolean => {
  // 验证是否为整数
  if (!/^\d+$/.test(year.trim())) {
    return false;
  }

  const yearNum = parseInt(year);
  const currentYear = new Date().getFullYear();
  // 只验证不能超过当前年份，不限制最小年份
  return yearNum > 0 && yearNum <= currentYear;
};

export const validateURLFileType = (
  url: string,
  fileType: FileType
): { isValid: boolean; error?: string } => {
  if (!url.trim()) {
    return { isValid: true }; // 空URL不验证
  }

  const cleanedUrl = cleanURL(url);

  // 首先验证URL格式
  const urlFormatValidation = validateURLFormat(cleanedUrl.toString());
  if (!urlFormatValidation.isValid) {
    return urlFormatValidation;
  }

  if (cleanedUrl.origin !== process.env.NEXT_PUBLIC_SITE_BASE_URL) {
      return { isValid: false, error: `URL 必须指向 ${process.env.NEXT_PUBLIC_SITE_BASE_URL}` };
  }
  const urlPattern =
    /^\/files\/([a-f0-9]{32})\.([a-zA-Z0-9]+)$/i;
  const match = cleanedUrl.pathname.match(urlPattern);
  if (!match) {
    return { isValid: false, error: "URL格式不正确" };
  }

  const extension = match[2].toLowerCase();

  // 定义允许的扩展名
  const allowedExtensions = {
    book: ["pdf"],
    test: ["pdf"],
    doc: ["pdf", "zip"],
  };

  const allowed = allowedExtensions[fileType];
  if (!allowed.includes(extension)) {
    const fileTypeName =
      fileType === "book" ? "书籍" : fileType === "test" ? "试题" : "资料";
    const allowedFormats = fileType === "doc" ? "PDF 或 ZIP" : "PDF";
    return {
      isValid: false,
      error: `${fileTypeName}类型只支持 ${allowedFormats} 格式，检测到的格式为 ${extension.toUpperCase()}`,
    };
  }

  return { isValid: true };
};

// 从URL中提取MD5
export const extractMD5FromURL = (url: string): string => {
  const cleanedUrl = cleanURL(url);
  const urlPattern =
    /^\/files\/([a-f0-9]{32})\.([a-zA-Z0-9]+)$/i;
  const match = cleanedUrl.pathname.match(urlPattern);
  return match ? match[1] : "";
};

// 从URL中提取文件格式
export const extractFileTypeFromURL = (
  url: string,
  fileType: FileType
): string => {
  const cleanedUrl = cleanURL(url);
  const urlPattern =
    /^\/files\/([a-f0-9]{32})\.([a-zA-Z0-9]+)$/i;
  const match = cleanedUrl.pathname.match(urlPattern);
  if (match) {
    const extension = match[2].toLowerCase();

    if (fileType === "doc") {
      return extension || "pdf";
    } else {
      // book和test类型只能使用pdf
      return "pdf";
    }
  }
  return "pdf"; // 默认返回pdf
};

// 从URL中提取文件名（MD5.扩展名）
export const extractFileNameFromURL = (url: string): string => {
  const cleanedUrl = cleanURL(url);
  const urlPattern =
    /^\/files\/([a-f0-9]{32}\.[a-zA-Z0-9]+)$/i;
  const match = cleanedUrl.pathname.match(urlPattern);
  return match ? match[1] : "";
};

// 验证URL格式是否正确
export const validateURLFormat = (
  url: string
): { isValid: boolean; error?: string } => {
  if (!url.trim()) {
    return { isValid: true }; // 空URL不验证
  }

  if (!url.startsWith(`${process.env.NEXT_PUBLIC_SITE_BASE_URL}/files/`)) {
    return {
      isValid: false,
      error: `URL 必须以 ${process.env.NEXT_PUBLIC_SITE_BASE_URL}/files/ 开头`,
    };
  }

  // 提取文件部分
  const filePart = url.replace(`${process.env.NEXT_PUBLIC_SITE_BASE_URL}/files/`, "");

  const dotIndex = filePart.lastIndexOf(".");
  if (dotIndex === -1) {
    return {
      isValid: false,
      error:
        `URL中 缺少文件扩展名，格式应为：${process.env.NEXT_PUBLIC_SITE_BASE_URL}/files/[MD5].[扩展名]`,
    };
  }

  const md5Part = filePart.substring(0, dotIndex);
  const extensionPart = filePart.substring(dotIndex + 1);

  if (!md5Part) {
    return {
      isValid: false,
      error: "URL中缺少 MD5 哈希值",
    };
  }

  if (md5Part.length !== 32) {
    return {
      isValid: false,
      error: `MD5 哈希值长度不正确，应为 32 位，当前为 ${md5Part.length} 位`,
    };
  }

  if (!/^[a-f0-9]+$/i.test(md5Part)) {
    return {
      isValid: false,
      error: "MD5 哈希值格式不正确，只能包含 0-9 和 a-f 字符",
    };
  }

  // 验证文件扩展名部分
  if (!extensionPart) {
    return {
      isValid: false,
      error: "URL 中缺少文件扩展名",
    };
  }

  // 检查是否有额外的路径或参数
  const fullPattern =
    /^\/files\/[a-f0-9]{32}\.[a-zA-Z0-9]+$/i;
  if (!fullPattern.test(new URL(url).pathname)) {
    return {
      isValid: false,
      error: "URL格式不正确，不能包含额外的路径或参数",
    };
  }

  return { isValid: true };
};
