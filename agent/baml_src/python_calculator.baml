// Calculator subagent that generates Python code for calculations
class PythonCode {
  python_code string @description("The python code to run, make sure all your python code is located on this json object of your response")
}

class CalculationResult {
  calculation_result string @description("The result of the calculation")
}

function PythonCalculator(
  request: string,
  python_code_response: string?,
) -> PythonCode | CalculationResult {
  client "openai/gpt-4o-mini"
  prompt #"
    You are a python calculator.
    You will receive a request to calculate something.
    You will return the python code to calculate the request, or in case you already have the output of the python code, return the calculation result.
    Only use python for calculations, do not use it for any other purpose.
    Remember you need to print using the print function anything you want to see as a return either for the user or for you.

    {% if python_code_response %}
      The following is the python code response:
      {{ python_code_response }}

      Check if this response has any errors, if stderr is empty, return the calculation result.
      If stderr is not empty, return the python code again trying to fix the errors.
    {% endif %}

    This is the request:
    {{ request }}

    {{ ctx.output_format }}
  "#
}

