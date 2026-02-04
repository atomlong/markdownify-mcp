import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { expandHome } from "./utils.js";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type MarkdownResult = {
  path: string;
  text: string;
};

export class Markdownify {
  private static getPythonPath(projectRoot: string): string {
    const venvPath = path.join(projectRoot, ".venv");
    return path.join(
      venvPath,
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'python.exe' : 'python3'
    );
  }

  private static async _splitPdf(
    filePath: string,
    projectRoot: string,
    pageStart?: number,
    pageEnd?: number
  ): Promise<string> {
    const pythonPath = this.getPythonPath(projectRoot);
    const splitScriptPath = path.join(__dirname, "split_pdf.py");
    const outputPdfPath = path.join(os.tmpdir(), `split_${Date.now()}.pdf`);

    let args = `"${filePath}" "${outputPdfPath}"`;
    if (pageStart !== undefined) args += ` --start ${pageStart}`;
    if (pageEnd !== undefined) args += ` --end ${pageEnd}`;

    const command = `"${pythonPath}" "${splitScriptPath}" ${args}`;
    
    const { stderr } = await execAsync(command);
    if (stderr) {
       console.warn(`Warning during PDF split: ${stderr}`);
    }
    
    return outputPdfPath;
  }

  private static async _markitdown(
    filePath: string,
    projectRoot: string,
    uvPath: string,
  ): Promise<string> {
    const venvPath = path.join(projectRoot, ".venv");
    const markitdownPath = path.join(
      venvPath,
      process.platform === "win32" ? "Scripts" : "bin",
      `markitdown${process.platform === "win32" ? ".exe" : ""}`,
    );

    if (!fs.existsSync(markitdownPath)) {
      throw new Error(`markitdown executable not found at ${markitdownPath}`);
    }

    const pythonPath = this.getPythonPath(projectRoot);
    const command = `"${pythonPath}" -W ignore -m markitdown "${filePath}"`;
    
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer to handle large files
    });

    if (stderr) {
      throw new Error(`Error executing command: ${stderr}`);
    }

    return stdout;
  }

  private static async saveToTempFile(
    content: string | Buffer,
    suggestedExtension?: string | null,
  ): Promise<string> {
    let outputExtension = "md";
    if (suggestedExtension != null) {
      outputExtension = suggestedExtension;
    }

    const tempOutputPath = path.join(
      os.tmpdir(),
      `markdown_output_${Date.now()}.${outputExtension}`,
    );
    fs.writeFileSync(tempOutputPath, content);
    return tempOutputPath;
  }

  private static normalizePath(p: string): string {
    return path.normalize(p);
  }

  static async toMarkdown({
    filePath,
    url,
    projectRoot = path.resolve(__dirname, ".."),
    uvPath = "~/.local/bin/uv",
    pageStart,
    pageEnd,
  }: {
    filePath?: string;
    url?: string;
    projectRoot?: string;
    uvPath?: string;
    pageStart?: number;
    pageEnd?: number;
  }): Promise<MarkdownResult> {
    try {
      let inputPath: string;
      let isTemporary = false;

      if (url) {
        const response = await fetch(url);

        let extension = null;

        if (url.endsWith(".pdf")) {
          extension = "pdf";
        }

        const arrayBuffer = await response.arrayBuffer();
        const content = Buffer.from(arrayBuffer);

        inputPath = await this.saveToTempFile(content, extension);
        isTemporary = true;
      } else if (filePath) {
        inputPath = filePath;
      } else {
        throw new Error("Either filePath or url must be provided");
      }

      let processingPath = inputPath;
      let isSplitTemporary = false;

      // Handle PDF splitting if needed
      if ((pageStart !== undefined || pageEnd !== undefined) && 
          (inputPath.toLowerCase().endsWith(".pdf"))) {
         processingPath = await this._splitPdf(inputPath, projectRoot, pageStart, pageEnd);
         isSplitTemporary = true;
      }

      const text = await this._markitdown(processingPath, projectRoot, uvPath);
      const outputPath = await this.saveToTempFile(text);

      if (isTemporary) {
        fs.unlinkSync(inputPath);
      }
      
      if (isSplitTemporary) {
        fs.unlinkSync(processingPath);
      }

      return { path: outputPath, text };
    } catch (e: unknown) {
      if (e instanceof Error) {
        throw new Error(`Error processing to Markdown: ${e.message}`);
      } else {
        throw new Error("Error processing to Markdown: Unknown error occurred");
      }
    }
  }

  static async get({
    filePath,
  }: {
    filePath: string;
  }): Promise<MarkdownResult> {
    // Check file type is *.md or *.markdown
    const normPath = this.normalizePath(path.resolve(expandHome(filePath)));
    const markdownExt = [".md", ".markdown"];
    if (!markdownExt.includes(path.extname(normPath))) {
      throw new Error("Required file is not a Markdown file.");
    }

    if (process.env?.MD_SHARE_DIR) {
      const allowedShareDir = this.normalizePath(
        path.resolve(expandHome(process.env.MD_SHARE_DIR)),
      );
      if (!normPath.startsWith(allowedShareDir)) {
        throw new Error(`Only files in ${allowedShareDir} are allowed.`);
      }
    }

    if (!fs.existsSync(filePath)) {
      throw new Error("File does not exist");
    }

    const text = await fs.promises.readFile(filePath, "utf-8");

    return {
      path: filePath,
      text: text,
    };
  }
}