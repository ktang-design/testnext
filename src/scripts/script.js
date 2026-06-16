// This file contains the JavaScript code for the component. 
// It may include functions to handle user interactions, manipulate the DOM, and implement any dynamic behavior.

document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('myButton');
    const output = document.getElementById('output');

    button.addEventListener('click', () => {
        output.textContent = 'Button was clicked!';
    });
});