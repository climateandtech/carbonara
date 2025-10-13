import org.springframework.data.repository.CrudRepository;
import java.util.Arrays;
import java.util.List;
import java.util.ArrayList;
import java.util.Optional;
import java.util.stream.Stream;

interface EmployeeRepository extends CrudRepository<Employee, Integer> {
}

class Employee {
    private Integer id;
    private String name;
}

class GCI1Examples {
    private EmployeeRepository employeeRepository;

    // Non-compliant: Spring repository call in for loop
    public void nonCompliantForLoop() {
        List<Integer> ids = Arrays.asList(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
        List<Employee> employees = new ArrayList<>();

        for (Integer id: ids) {
            Optional<Employee> employee = employeeRepository.findById(id); // Should be detected
            if (employee.isPresent()) {
                employees.add(employee.get());
            }
        }
    }

    // Non-compliant: Spring repository call in stream forEach
    public void nonCompliantStreamForEach() {
        List<Employee> employees = new ArrayList<>();
        Stream<Integer> stream = Stream.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

        stream.forEach(id -> {
            Optional<Employee> employee = employeeRepository.findById(id); // Should be detected
            if (employee.isPresent()) {
                employees.add(employee.get());
            }
        });
    }

    // Non-compliant: Another variation with enhanced for loop
    public void nonCompliantEnhancedLoop() {
        List<Integer> ids = Arrays.asList(1, 2, 3, 4, 5);

        for (Integer id : ids) {
            Employee emp = employeeRepository.findById(id).orElse(null); // Should be detected
            if (emp != null) {
                System.out.println(emp);
            }
        }
    }

    // Compliant: Using batch operation
    public void compliantBatchOperation() {
        List<Integer> ids = Arrays.asList(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
        List<Employee> employees = (List<Employee>) employeeRepository.findAllById(ids);
    }

    // Compliant: Using batch with stream
    public void compliantStreamToBatch() {
        List<Integer> ids = Stream.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10).toList();
        List<Employee> employees = (List<Employee>) employeeRepository.findAllById(ids);
    }

    // Compliant: Single repository call outside loop
    public void compliantSingleCall() {
        Optional<Employee> employee = employeeRepository.findById(1);
        if (employee.isPresent()) {
            System.out.println(employee.get());
        }
    }
}
