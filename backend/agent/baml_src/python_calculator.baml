// Calculator subagent that generates Python code for calculations
class PythonCode {
  plannification_steps string @description("The plannification steps to follow to calculate the request")
  python_code string @description("The python code to run, make sure all your python code is located on this json object of your response")
}

class CalculationResult {
  calculation_result string @description("The result of the calculation")
}

function PythonCalculator(
  request: string,
  python_code_response: string?,
  previous_plannification_steps: string?,
  previous_python_code: string?,
  iteration_count: int,
  max_iterations: int,
  current_date: string,
) -> PythonCode | CalculationResult {
  client "openai/gpt-4o-mini"
  prompt #"
    You are a python calculator.
    You will receive a request to calculate something.
    You will return the python code to calculate the request, or in case you already have the output of the python code, return the calculation result.
    Only use python for calculations, do not use it for any other purpose.
    Remember you need to print using the print function anything you want to see as a return either for the user or for you.

    Current date: {{ current_date }}
    Use this date as the reference point for any date-related calculations or time-sensitive information.

    This is the request:
    ```
    {{ request }}
    ```

    Current iteration: {{ iteration_count }} / {{ max_iterations }}

    {% if previous_plannification_steps %}
      PLANNING STEPS (from previous decision):
      ```
      {{ previous_plannification_steps }}
      ```

      IMPORTANT: Review the planning steps above. If you created a plan with multiple calculation steps, make sure to continue with the remaining steps. Do not stop after completing just one step if your plan indicates multiple steps are needed. Follow the plan you created to ensure all calculations are completed. Verify the steps that have already been completed and make sure to continue with the remaining steps, and not cycle through the same steps.
    {% endif %}

    {% if previous_python_code %}
      Previous Python code that was executed:
      ```python
      {{ previous_python_code }}
      ```

      Review your previous code to understand what was attempted and identify any issues or improvements needed.
    {% endif %}

    {% if python_code_response %}
      Output from executing the previous Python code:
      ```
      {{ python_code_response }}
      ```

      Analyze this output:
      - If there are errors (stderr), return new PythonCode with corrected code
      - If the output is successful but incomplete, determine if you need to refine the code or if the result is satisfactory
      - If the output successfully answers the request completely, return CalculationResult with the final answer
    {% endif %}

    IMPORTANT: 
    - If the iteration count ({{ iteration_count }}) is equal to or greater than the max iterations ({{ max_iterations }}), you MUST return CalculationResult with the best result you have, even if it's not perfect. Do not request more code generation when you've reached the limit.
    - Use the previous plannification steps, previous code, and execution output to make an informed decision about whether the calculation is complete or needs improvement.
    - If the previous code executed successfully and the output answers the request, return CalculationResult instead of generating new code.

    {{ ctx.output_format }}
  "#
}

test calculate_compound_interest {
  functions [PythonCalculator]
  args {
    request "Calculate the compound interest for $1000 invested at 5% for 10 years."
    iteration_count 0
    max_iterations 3
    current_date "2024-01-15"
  }
}
