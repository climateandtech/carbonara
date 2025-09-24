# This file demonstrates various performance anti-patterns that fasterer detects
# Each section shows code that can be optimized for better performance

class FastererOffenses
  attr_reader :data, :array, :hash

  def initialize
    @data = (1..1000).to_a
    @array = %w[apple banana cherry date elderberry]
    @hash = { a: 1, b: 2, c: 3, d: 4, e: 5 }
  end

  # Offense: rescue_vs_respond_to
  # Using rescue for control flow is slower than checking with respond_to?
  def rescue_vs_respond_to_offense(obj)
    # BAD: Using rescue for control flow
    begin
      obj.some_method
    rescue NoMethodError
      "method doesn't exist"
    end
  end

  # Offense: module_eval (using define_method is faster than module_eval with string)
  def module_eval_offense
    # BAD: Using module_eval with string
    self.class.module_eval("def dynamic_method; 'hello'; end")
  end

  # Offense: shuffle_first_vs_sample
  # Using sample is faster than shuffle.first
  def shuffle_first_offense
    # BAD: shuffle.first
    @array.shuffle.first
  end

  # Offense: for_loop_vs_each
  # Using each is more idiomatic and faster than for loops
  def for_loop_offense
    result = []
    # BAD: for loop
    for i in @data
      result << i * 2
    end
    result
  end

  # Offense: each_with_index_vs_while
  # While can be faster for simple index operations (though less idiomatic)
  def each_with_index_offense
    sum = 0
    # This might trigger if configured - each_with_index can be slower
    @data.each_with_index do |val, idx|
      sum += val * idx
    end
    sum
  end

  # Offense: map_flatten_vs_flat_map
  # flat_map is faster than map.flatten
  def map_flatten_offense
    # BAD: map.flatten
    [[1, 2], [3, 4], [5, 6]].map { |arr| arr.map { |x| x * 2 } }.flatten
  end

  # Offense: reverse_each_vs_reverse_each (typo in config, should be reverse.each vs reverse_each)
  # reverse_each is faster than reverse.each
  def reverse_each_offense
    # BAD: reverse.each
    @data.reverse.each { |item| puts item }
  end

  # Offense: select_first_vs_detect
  # detect/find is faster than select.first
  def select_first_offense
    # BAD: select.first
    @data.select { |n| n > 500 }.first
  end

  # Offense: select_last_vs_reverse_detect
  # reverse.detect is faster than select.last
  def select_last_offense
    # BAD: select.last
    @data.select { |n| n < 500 }.last
  end

  # Offense: sort_vs_sort_by
  # sort_by is faster for complex comparisons
  def sort_offense
    # BAD: sort with block
    @array.sort { |a, b| a.length <=> b.length }
  end

  # Offense: fetch_with_argument_vs_block
  # fetch with block is faster than fetch with argument for default values
  def fetch_with_argument_offense
    # BAD: fetch with argument that allocates
    @hash.fetch(:missing_key, expensive_default_calculation)
  end

  def expensive_default_calculation
    sleep(0.1)
    "default"
  end

  # Offense: keys_each_vs_each_key
  # each_key is faster than keys.each
  def keys_each_offense
    # BAD: keys.each
    @hash.keys.each { |key| puts key }
  end

  # Offense: hash_merge_bang_vs_hash_brackets
  # Using []= is faster than merge! for single key updates
  def hash_merge_bang_offense
    # BAD: merge! for single key
    @hash.merge!(new_key: 'value')
  end

  # Offense: block_vs_symbol_to_proc
  # Symbol to_proc is faster for simple method calls
  def block_vs_symbol_to_proc_offense
    # BAD: block for simple method call
    @array.map { |s| s.upcase }
  end

  # Offense: proc_call_vs_yield
  # yield is faster than proc.call
  def proc_call_offense(&block)
    # BAD: block.call
    block.call if block
  end

  # Offense: gsub_vs_tr
  # tr is faster than gsub for character replacement
  def gsub_vs_tr_offense(string)
    # BAD: gsub for single character replacement
    string.gsub('a', 'b')
  end

  # Offense: select_keys_vs_select
  # Using select on hash is cleaner than selecting keys
  def select_keys_offense
    # BAD: selecting keys then fetching values
    @hash.select { |k, v| [:a, :b].include?(k) }
  end

  # Offense: getter_vs_attr_reader
  # attr_reader is faster than manual getter
  def get_data
    # BAD: manual getter instead of attr_reader
    @data
  end

  # Offense: setter_vs_attr_writer  
  # attr_writer is faster than manual setter
  def set_data(value)
    # BAD: manual setter instead of attr_writer
    @data = value
  end

  # Offense: include_vs_cover_on_range
  # cover? is faster than include? for ranges
  def include_on_range_offense
    # BAD: include? on range
    (1..1000).include?(500)
  end

  # Offense: last_vs_index_minus_one
  # Using last is cleaner and faster than [-1]
  def array_index_offense
    # BAD: array[-1]
    @array[-1]
  end

  # Offense: pattern matching related offenses
  def case_when_offense(value)
    # Could be optimized with pattern matching in newer Ruby
    case value
    when 1
      "one"
    when 2
      "two"
    when 3
      "three"
    else
      "other"
    end
  end

  # Offense: any_vs_empty
  # Using any? is more idiomatic than !empty?
  def any_empty_offense
    # BAD: !empty?
    !@array.empty?
  end

  # Offense: first_vs_index_zero
  # Using first is cleaner than [0]
  def first_offense
    # BAD: array[0]
    @array[0]
  end

  # Offense: reverse_merge vs merge
  # When merging defaults, reverse_merge can be clearer
  def merge_defaults_offense(options = {})
    # BAD: complex merge for defaults
    defaults = { color: 'red', size: 'large' }
    defaults.merge(options)
  end

  # Multiple offenses in one method
  def multiple_offenses
    # Multiple bad patterns
    result = []
    
    # for loop
    for item in @array
      # map with block instead of symbol to_proc
      modified = [item].map { |x| x.upcase }
      
      # select.first
      found = @data.select { |n| n > 100 }.first
      
      # gsub instead of tr
      cleaned = item.gsub('a', 'x')
      
      # map.flatten
      nested = [[1], [2]].map { |a| a }.flatten
      
      result << modified
    end
    
    # shuffle.first
    random = result.shuffle.first
    
    # rescue for control flow
    begin
      random.some_method
    rescue
      nil
    end
  end

  # Class methods with offenses
  class << self
    def class_level_offenses
      data = (1..100).to_a
      
      # reverse.each
      data.reverse.each { |n| puts n }
      
      # keys.each
      { a: 1, b: 2 }.keys.each { |k| puts k }
      
      # Bad string interpolation patterns
      name = "Ruby"
      # Using + instead of interpolation (though this might not be fasterer specific)
      message = "Hello " + name + "!"
    end
  end
end

# Additional examples outside the class

# Global method with offenses
def standalone_offenses
  numbers = (1..50).to_a
  
  # map.flatten offense
  nested_arrays = [[1, 2], [3, 4], [5, 6]]
  flattened = nested_arrays.map { |arr| arr.map { |n| n * 2 } }.flatten
  
  # shuffle.first offense  
  random_number = numbers.shuffle.first
  
  # select.first offense
  first_even = numbers.select { |n| n.even? }.first
  
  # for loop offense
  for num in numbers
    puts num * 2
  end
  
  # Using rescue for control flow
  begin
    nil.some_undefined_method
  rescue NoMethodError
    "handled"
  end
end

# Method that takes a block with proc.call offense
def method_with_block(&block)
  # BAD: using block.call instead of yield
  block.call("argument") if block
end

# String manipulation offenses
def string_offenses(text)
  # gsub vs tr
  text.gsub("e", "3").gsub("a", "@").gsub("i", "1")
  
  # Multiple gsubs that could be optimized
  text.gsub(/\s+/, " ").gsub(/[aeiou]/, "")
end

# Hash manipulation offenses
def hash_offenses
  original = { a: 1, b: 2, c: 3 }
  
  # merge! for single assignment
  original.merge!(d: 4)
  
  # keys.each
  original.keys.each do |key|
    puts original[key]
  end
  
  # Hash[] vs to_h
  pairs = [[:x, 1], [:y, 2]]
  Hash[pairs]  # Could use pairs.to_h
end

# Range offenses
def range_offenses
  range = (1..1000)
  
  # include? on range (should use cover?)
  range.include?(750)
  
  # to_a.include? on range
  range.to_a.include?(250)
end

# Array access offenses
def array_access_offenses
  arr = %w[first second third fourth fifth]
  
  # Using index instead of first/last
  first_item = arr[0]
  last_item = arr[-1]
  second_last = arr[-2]
  
  # Chaining reverse operations
  arr.reverse.reverse.each { |x| puts x }
end