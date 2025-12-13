import { TavilySearch } from "@langchain/tavily";
import { PythonInterpreterTool } from "@langchain/community/experimental/tools/pyinterpreter";
import pyodideModule from "pyodide/pyodide.js";

// Initialize pyodide (lazy initialization)
let pyodideInstance: any = null;
let pythonTool: PythonInterpreterTool | null = null;
let initializationPromise: Promise<PythonInterpreterTool> | null = null;

async function initializePyodide(): Promise<PythonInterpreterTool> {
  if (pythonTool) {
    return pythonTool;
  }
  
  if (initializationPromise) {
    return initializationPromise;
  }
  
  initializationPromise = (async () => {
    pyodideInstance = await pyodideModule.loadPyodide();
    pythonTool = new PythonInterpreterTool({ instance: pyodideInstance });
    await pyodideInstance.loadPackage("numpy");
    return pythonTool;
  })();
  
  return initializationPromise;
}

// Tavily web search - direct function (not a tool wrapper)
export async function tavilySearch(query: string, maxResults: number = 5): Promise<string> {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY environment variable is not set");
  }

  const tavily = new TavilySearch({
    tavilyApiKey: process.env.TAVILY_API_KEY,
    maxResults,
  });

  const results = await tavily.invoke({
    query,
  });
  return JSON.stringify(results, null, 2);
}

// Python code execution using PythonInterpreterTool
export async function pythonExecutor(code: string): Promise<string> {
  try {
    const tool = await initializePyodide();
    const result = await tool.invoke(code);
    return JSON.stringify(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Execution error: ${errorMessage}`;
  }
}

