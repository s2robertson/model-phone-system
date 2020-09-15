import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/extend-expect';

import ArrayNavigator from './arrayNavigator';

test('appropriate headers render when array is empty', async () => {
    render(<ArrayNavigator mainTitle='Array Navigator' />);

    //debug();
    expect(screen.getByText('Array Navigator')).toBeInTheDocument();
    expect(screen.getByText('←')).toBeDisabled();
    expect(screen.getByText('→')).toBeDisabled();

    // Add and Remove buttons shouldn't be present
    expect(screen.queryByText('Add')).not.toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
});

test('can navigate between elements', async () => {
    const children = ['Hello World', 'React', 'Jest'];
    const canMove = true;

    render(
        <ArrayNavigator
            mainTitle='Topics'
            arrayLength={children.length}
            canMove={canMove}
        >
            {(index) => children[index]}
        </ArrayNavigator>
    );

    const buttonBack = screen.getByText('←');
    const buttonForward = screen.getByText('→');

    // it should start on element 0
    expect(screen.getByText(/Topics/)).toBeInTheDocument();
    expect(screen.getByText(/\(1 of 3\)/)).toBeInTheDocument();
    expect(buttonBack).toBeDisabled();
    expect(buttonForward).toBeEnabled();
    expect(screen.getByText('Hello World')).toBeInTheDocument();

    // navigate forward
    userEvent.click(buttonForward);
    expect(screen.getByText(/\(2 of 3\)/)).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(buttonBack).toBeEnabled();

    // navigate forward again
    userEvent.click(buttonForward);
    expect(screen.getByText(/\(3 of 3\)/)).toBeInTheDocument();
    expect(screen.getByText('Jest')).toBeInTheDocument();
    expect(buttonForward).toBeDisabled();

    // navigate back
    userEvent.click(buttonBack);
    expect(screen.getByText(/\(2 of 3\)/)).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(buttonBack).toBeEnabled();
    expect(buttonForward).toBeEnabled();
});

test('can add and remove elements', async () => {
    const children = ['Hello World', 'React', 'Jest'];
    const canMove = true;
    let canAdd = true;
    const addCallback = () => children.push('Testing Library');
    let canRemove = true;
    const removeCallback = index => children.splice(index, 1);

    const { rerender } = render(
        <ArrayNavigator
            mainTitle='Topics'
            arrayLength={children.length}
            canMove={canMove}
            canAdd={canAdd}
            addCallback={addCallback}
            canRemove={canRemove}
            removeCallback={removeCallback}
        >
            {(index) => children[index]}
        </ArrayNavigator>
    );

    expect(screen.getByText(/\(1 of 3\)/)).toBeInTheDocument();
    expect(screen.getByText('Hello World')).toBeInTheDocument();
    expect(screen.getByText('Add')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();

    // now to add an item
    userEvent.click(screen.getByText('Add'));
    canAdd = false;
    rerender(
        <ArrayNavigator
            mainTitle='Topics'
            arrayLength={children.length}
            canMove={canMove}
            canAdd={canAdd}
            addCallback={addCallback}
            canRemove={canRemove}
            removeCallback={removeCallback}
        >
            {(index) => children[index]}
        </ArrayNavigator>
    );
    expect(screen.getByText(/\(4 of 4\)/)).toBeInTheDocument();
    expect(screen.getByText('Testing Library')).toBeInTheDocument();
    expect(screen.getByText('→')).toBeDisabled();
    expect(screen.queryByText('Add')).not.toBeInTheDocument();

    // navigate back to item two
    const buttonBack = screen.getByText('←');
    userEvent.click(buttonBack);
    userEvent.click(buttonBack);
    expect(screen.getByText(/\(2 of 4\)/)).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();

    // remove two items
    userEvent.click(screen.getByText('Remove'));
    rerender(
        <ArrayNavigator
            mainTitle='Topics'
            arrayLength={children.length}
            canMove={canMove}
            canAdd={canAdd}
            addCallback={addCallback}
            canRemove={canRemove}
            removeCallback={removeCallback}
        >
            {(index) => children[index]}
        </ArrayNavigator>
    );
    expect(screen.getByText(/\(1 of 3\)/)).toBeInTheDocument();
    expect(screen.getByText('Hello World')).toBeInTheDocument();
    userEvent.click(screen.getByText('Remove'));
    canRemove = false;
    rerender(
        <ArrayNavigator
            mainTitle='Topics'
            arrayLength={children.length}
            canMove={canMove}
            canAdd={canAdd}
            addCallback={addCallback}
            canRemove={canRemove}
            removeCallback={removeCallback}
        >
            {(index) => children[index]}
        </ArrayNavigator>
    );
    expect(screen.getByText(/\(1 of 2\)/)).toBeInTheDocument();
    expect(screen.getByText('Jest')).toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    expect(children).toEqual(['Jest', 'Testing Library']);
});

test('canMove, canAdd, and canRemove as functions', async () => {
    const children = ['Hello World', 'React', 'Jest'];
    const canMove = index => index < 2;
    let canAdd = index => index === 0;
    const addCallback = () => children.push('Testing Library');
    let canRemove = () => children.length > 2;
    const removeCallback = index => children.splice(index, 1);

    const { rerender } = render(
        <ArrayNavigator
            mainTitle='Topics'
            arrayLength={children.length}
            canMove={canMove}
            canAdd={canAdd}
            addCallback={addCallback}
            canRemove={canRemove}
            removeCallback={removeCallback}
        >
            {(index) => children[index]}
        </ArrayNavigator>
    );
    let buttonBack = screen.getByText('←');
    let buttonForward = screen.getByText('→');
    expect(screen.getByText('Add')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
    expect(buttonBack).toBeDisabled();
    expect(buttonForward).toBeEnabled();

    // moving forward should remove the add button
    userEvent.click(buttonForward);
    expect(screen.queryByText('Add')).not.toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
    expect(buttonBack).toBeEnabled();
    expect(buttonForward).toBeEnabled();

    // removing an element should remove the remove button
    userEvent.click(buttonForward);
    userEvent.click(screen.getByText('Remove'));
    rerender(
        <ArrayNavigator
            mainTitle='Topics'
            arrayLength={children.length}
            canMove={canMove}
            canAdd={canAdd}
            addCallback={addCallback}
            canRemove={canRemove}
            removeCallback={removeCallback}
        >
            {(index) => children[index]}
        </ArrayNavigator>
    );
    buttonBack = screen.getByText('←');
    buttonForward = screen.getByText('→');
    expect(buttonBack).toBeEnabled();
    expect(buttonForward).toBeDisabled();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
})